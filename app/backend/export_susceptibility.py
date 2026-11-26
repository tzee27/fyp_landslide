"""Export deployment-only Linear SVMs using the frozen development partition."""

import argparse
import hashlib
import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import sklearn
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.model_selection import GridSearchCV, StratifiedGroupKFold
from sklearn.neighbors import BallTree
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.svm import SVC

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = Path(__file__).resolve().with_name("model_data")
EVALUATION = ROOT / "outputs/model_evaluation"
MANIFEST = EVALUATION / "spatial_partition_manifest.csv"
FEATURE_DIR = ROOT / "data/processed/features"
ENHANCEMENT = FEATURE_DIR / "historical_environmental_enhancement_recovery_REVIEW.csv"
TERRAIN = FEATURE_DIR / "terrain_derivatives_v1.csv"
CATEGORY = "landcover_pre_event_class"
STATIC = """
elevation_m slope_deg aspect_sin aspect_cos profile_curvature_m_inv plan_curvature_m_inv
topographic_wetness_index soil_clay_surface soil_sand_surface soil_silt_surface soil_bdod_surface
road_distance_m waterway_distance_m landcover_pre_event_class ndvi_pre_event ndvi_change_2y
forest_loss_5y_250m_pct merit_upstream_area_km2 merit_hand_m
""".split()
FEATURES = {"static": STATIC, "temporal": STATIC + """
rain_1d_mm rain_3d_mm rain_7d_mm rain_14d_mm rain_30d_mm soil_moisture_7d_m3m3 runoff_7d_mm runoff_30d_mm
""".split()}
EXTRA = "ndvi_pre_event ndvi_change_2y forest_loss_5y_250m_pct runoff_7d_mm runoff_30d_mm merit_upstream_area_km2 merit_hand_m".split()
DERIVATIVES = STATIC[4:7]
EXPECTED = {"static": (1308, 660), "temporal": (1287, 642)}
SEED = 2026


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def dataset_path(branch):
    return ROOT / "data/processed/modelling" / f"{branch}_model_dataset.csv"


def development_rows(branch):
    cols = FEATURES[branch]
    official = pd.read_csv(EVALUATION / "final_common_features_v1/LinearSVM_folds.csv")
    signature = hashlib.sha256("|".join(cols).encode()).hexdigest()[:16]
    if set(official.loc[official.branch == branch, "feature_signature"]) != {signature}:
        raise ValueError("Ordered predictors differ from the official comparison.")
    raw = pd.read_csv(dataset_path(branch), low_memory=False).drop(columns=["spatial_block_id"], errors="ignore")
    partition = pd.read_csv(MANIFEST, dtype={"spatial_block_id": str}).query("branch == @branch")
    if set(raw.sample_id) != set(partition.sample_id) or set(partition.partition) != {"train", "heldout"}:
        raise ValueError("Modelling samples and frozen manifest differ.")
    aligned = raw.merge(partition.drop(columns="branch"), on=["sample_id", "matched_event_id"],
                        validate="one_to_one", how="left", sort=False)
    if aligned.partition.isna().any() or aligned.groupby("matched_event_id").partition.nunique().ne(1).any():
        raise ValueError("Invalid partition assignments or matched groups.")
    train_count, heldout_count = EXPECTED[branch]
    frame = aligned.loc[aligned.partition.eq("train")].copy()
    if len(frame) != train_count or len(aligned) - len(frame) != heldout_count:
        raise ValueError("Unexpected frozen partition sizes.")
    side = pd.read_csv(ENHANCEMENT, usecols=["sample_id", *EXTRA])
    frame = frame.merge(side, on="sample_id", validate="one_to_one", how="left", sort=False)
    terrain = pd.read_csv(TERRAIN, usecols=["sample_id", "matched_event_id", "longitude", "latitude", *DERIVATIVES])
    frame = frame.merge(terrain, on=["sample_id", "matched_event_id"], validate="one_to_one",
                        how="left", sort=False, suffixes=("", "_terrain"))
    for coordinate in ("longitude", "latitude"):
        if not np.allclose(frame[coordinate], frame[coordinate + "_terrain"], atol=1e-7, rtol=0):
            raise ValueError("Terrain coordinates differ from Notebook 04 inputs.")
    for feature in cols:
        if feature == CATEGORY:
            frame[feature] = frame[feature].astype("string").replace(
                {"nan": pd.NA, "None": pd.NA, "": pd.NA}
            ).fillna("Unknown").astype(str)
        else:
            frame[feature] = pd.to_numeric(frame[feature], errors="coerce").replace([np.inf, -np.inf], np.nan)
    groups = frame.groupby(["matched_event_id", "target"]).size().unstack(fill_value=0)
    if not (groups[0].eq(2) & groups[1].eq(1)).all():
        raise ValueError("Expected one case and two controls per group.")
    return frame


def geographic_folds(frame):
    points = np.radians(frame[["latitude", "longitude"]].to_numpy(dtype=float))
    splitter = StratifiedGroupKFold(n_splits=3, shuffle=True, random_state=SEED)
    if frame.groupby("matched_event_id").spatial_block_id.nunique().ne(1).any():
        raise ValueError("A matched group spans multiple parent blocks.")
    folds, audit = [], []
    for train, validation in splitter.split(frame, frame.target, frame.spatial_block_id):
        tree = BallTree(points[validation], metric="haversine")
        nearest = tree.query(points[train], k=1)[0][:, 0] * 6371.0088
        excluded = frame.iloc[train[nearest < 5.0 - 1e-8]].matched_event_id
        train = train[~frame.iloc[train].matched_event_id.isin(excluded).to_numpy()]
        training, testing = frame.iloc[train], frame.iloc[validation]
        if (
            training.matched_event_id.nunique() < 10
            or training.target.nunique() != 2 or testing.target.nunique() != 2
            or not training.groupby("matched_event_id").size().eq(3).all()
            or not testing.groupby("matched_event_id").size().eq(3).all()
            or set(training.matched_event_id) & set(testing.matched_event_id)
        ):
            raise ValueError("Invalid geographically buffered fold.")
        distance = float(tree.query(points[train], k=1)[0].min() * 6371.0088)
        if distance < 5.0 - 1e-7:
            raise ValueError("Geographic embargo failed.")
        audit.append({"train_rows": len(train), "validation_rows": len(validation), "minimum_km": distance})
        folds.append((train, validation))
    return folds, audit


def pipeline(columns):
    return Pipeline([
        ("prep", ColumnTransformer([
            ("numeric", Pipeline([
                ("imputer", SimpleImputer(strategy="median", keep_empty_features=True)),
                ("scaler", StandardScaler()),
            ]), [column for column in columns if column != CATEGORY]),
            ("categorical", Pipeline([
                ("imputer", SimpleImputer(strategy="constant", fill_value="Unknown")),
                ("onehot", OneHotEncoder(handle_unknown="ignore")),
            ]), [CATEGORY]),
        ], remainder="drop", sparse_threshold=0)),
        ("model", SVC(kernel="linear", class_weight="balanced", random_state=SEED)),
    ])


def decision_scores(fitted, branch, features):
    if list(features.columns) != FEATURES[branch] or list(fitted.feature_names_in_) != FEATURES[branch]:
        raise ValueError("Input columns must match the saved model's exact feature order.")
    scores = fitted.decision_function(features)
    if not np.isfinite(scores).all():
        raise ValueError("Model returned a nonfinite score.")
    return scores


def score_complete_cells(fitted, branch, features):
    """Leave unsupported cells without scores, independently of fitted imputation."""
    if list(features.columns) != FEATURES[branch]:
        raise ValueError("Pilot columns do not match the ordered predictor contract.")
    numeric = features.drop(columns=CATEGORY).apply(pd.to_numeric, errors="coerce")
    categories = fitted.named_steps["prep"].named_transformers_["categorical"].named_steps["onehot"].categories_[0]
    supported = np.isfinite(numeric).all(axis=1) & features[CATEGORY].isin(categories) & features[CATEGORY].ne("Unknown")
    scores = pd.Series(np.nan, index=features.index, dtype=float)
    if supported.any():
        batch = features.loc[supported].copy()
        for column in numeric:
            batch[column] = numeric.loc[supported, column]
        scores.loc[supported] = decision_scores(fitted, branch, batch)
    return scores


def source_digests(branch):
    return {path.name: digest(path) for path in [MANIFEST, dataset_path(branch), ENHANCEMENT, TERRAIN]}


def recover_export(branch):
    """Open and verify a trusted model produced by this project exporter."""
    target = OUTPUT / f"{branch}_linear_svm.joblib"
    metadata = json.loads(target.with_suffix(".json").read_text(encoding="utf-8"))
    if (
        metadata["branch"] != branch or metadata["features"] != FEATURES[branch]
        or metadata["threshold"] != 0.0 or metadata["model_sha256"] != digest(target)
        or metadata["scikit_learn"] != sklearn.__version__
        or metadata["input_sha256"] != source_digests(branch)
    ):
        raise ValueError("Export schema, model hash, runtime version, or research inputs changed.")
    fitted = joblib.load(target)
    estimator = fitted.named_steps["model"]
    if not isinstance(estimator, SVC) or estimator.kernel != "linear" or estimator.class_weight != "balanced":
        raise ValueError("Expected a fitted balanced linear SVC.")
    frame = development_rows(branch).set_index("sample_id")
    references = metadata["reference_scores"]
    scores = decision_scores(fitted, branch, frame.loc[list(references), FEATURES[branch]])
    np.testing.assert_allclose(scores, list(references.values()), atol=1e-12, rtol=0)
    return fitted, metadata


def export(branch):
    frame = development_rows(branch)
    folds, audit = geographic_folds(frame)
    cols = FEATURES[branch]
    tune = GridSearchCV(pipeline(cols), {"model__C": [0.03, 0.1, 1.0]},
                        cv=folds, scoring="roc_auc", refit=True, error_score="raise", n_jobs=1)
    tune.fit(frame[cols], frame.target)
    fitted = tune.best_estimator_
    samples = frame.iloc[:5]
    reference = decision_scores(fitted, branch, samples[cols])
    OUTPUT.mkdir(exist_ok=True)
    target = OUTPUT / f"{branch}_linear_svm.joblib"
    temporary = target.with_suffix(".tmp")
    joblib.dump(fitted, temporary, compress=3)
    np.testing.assert_allclose(decision_scores(joblib.load(temporary), branch, samples[cols]),
                               reference, atol=1e-12, rtol=0)
    temporary.replace(target)
    metadata = {
        "branch": branch, "algorithm": "balanced linear-kernel SVC",
        "features": cols, "threshold": 0.0, "selected_c": tune.best_params_["model__C"],
        "development_rows": len(frame), "excluded_heldout_rows": EXPECTED[branch][1],
        "selection_mean_roc_auc": float(tune.best_score_), "geographic_folds": audit,
        "score_type": "decision_function margin, not a probability",
        "scikit_learn": sklearn.__version__, "pandas": pd.__version__, "numpy": np.__version__,
        "input_sha256": source_digests(branch),
        "model_sha256": digest(target),
        "reference_scores": dict(zip(samples.sample_id, reference.tolist(), strict=True)),
    }
    target.with_suffix(".json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    return metadata


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("branch", choices=FEATURES, nargs="+")
    for branch in parser.parse_args().branch:
        target = OUTPUT / f"{branch}_linear_svm.joblib"
        if target.exists() or target.with_suffix(".json").exists():
            _, result = recover_export(branch)
            action = "recovered"
        else:
            result = export(branch)
            action = "exported"
        print(f"{branch}: {action}, {result['development_rows']} development rows, C={result['selected_c']}, reload parity OK")
