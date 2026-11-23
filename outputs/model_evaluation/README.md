# Model training outputs

Notebook 04 reads the prepared static and temporal datasets from Notebook 03. It trains and evaluates models; it does not process inventory records, extract environmental data or generate controls. Run all cells to replace these same 10 files. No timestamped result folders or automatic backups are created.

| File | What it contains | When to use it |
|---|---|---|
| model_comparison.csv | Mean geographic validation scores, fold SD and train-validation gaps for LR, RF and XGBoost | Main model comparison for your report |
| cv_fold_results.csv | Per-fold metrics, parameters, thresholds and minimum separation distances | Explain performance variation and reproduce settings |
| oof_predictions.csv | One outer-validation prediction per development row and algorithm | Recalculate metrics and graphs without retraining |
| spatial_partition_manifest.csv | Stable development/previously inspected heldout membership | Keep comparisons on the same data split; do not delete casually |
| validated_candidate_model_summary.json | Selected model, ordered features, threshold, metrics, input hashes, versions and reload results | Read model settings or prepare integration |
| static_validated_candidate.joblib | Static preprocessing and trained model | Load for static inference |
| temporal_validated_candidate.joblib | Temporal preprocessing and trained model | Load for temporal-feature inference |
| static_evaluation.png | Static outer-validation ROC and LR confusion matrix | Report figure |
| temporal_evaluation.png | Temporal outer-validation ROC and LR confusion matrix | Report figure |
| README.md | This file guide and limitations | Understand the folder |

The notebook retains Logistic Regression and the without-geology feature set from the prior investigation. RF and XGBoost remain benchmark comparisons. The fixed feature set differs from the former per-fold feature-selection experiment, so changes in AUC must not automatically be described as improvements under an identical modelling procedure.

Each model uses a bounded three-configuration inner search and three outer geographic folds. Matched groups stay together and a 5 km actual-coordinate buffer removes nearby training groups. This does not guarantee independent geographic conditions or fully disjoint physical 50 km blocks. Previously inspected holdout rows are excluded from training and are not scored again. Results are development estimates after earlier exploration, not a fresh external test.

Read ROC-AUC and average precision together with precision, recall, F1 and the train-validation gap. Fold SD is descriptive, not an independent confidence interval. Figure ROC-AUC pools predictions and can differ from the table's mean fold AUC. Plot confusion matrices use fold-specific thresholds; exported thresholds are selected separately using full-development training CV.

Background samples are not verified absences. Road reporting bias, provisional inventory coordinates and upstream extraction differences remain limitations. In the reviewed upstream code, cases require complete IMERG acquisition counts, while controls accept about 95%; some cases use a native-grid ERA5 recheck. Notebook 04 does not alter or resolve these input issues. Temporal features under geographic CV do not establish future-year forecasting ability. Scores are relative case-versus-background outputs, not calibrated occurrence probabilities or official warnings.

The previous detailed investigation folder and duplicate legacy evaluation outputs were removed during simplification. The earlier investigation found LR strongest at approximately 0.775 AUC, substantial tree-model generalisation gaps, and 48/47 overlapping physical blocks in the old static/temporal holdout. Original controls were not regenerated. Inventory and feature preparation outputs remain in their original upstream folders.

For inference, load only trusted joblib files, supply the exact ordered features in the summary, use the stored pipeline, and apply its decision threshold if a class label is needed. No frontend/backend deployment is performed by this notebook.

## Latest training comparison

```text
  branch          algorithm  cv_auc  cv_auc_sd  train_auc  average_precision  precision  recall     f1  balanced_accuracy  train_validation_gap  selected_for_export
  static LogisticRegression  0.7760     0.0934     0.8573             0.6249     0.4762  0.7106 0.5609             0.6673                0.0813                 True
  static       RandomForest  0.6890     0.0716     0.9115             0.5237     0.3979  0.7611 0.5189             0.5985                0.2225                False
  static            XGBoost  0.6826     0.0758     0.8834             0.5132     0.4026  0.6668 0.4945             0.5899                0.2008                False
temporal LogisticRegression  0.7770     0.1044     0.8621             0.6290     0.5627  0.7552 0.6199             0.6958                0.0851                 True
temporal       RandomForest  0.7037     0.0600     0.9423             0.5554     0.3674  0.8252 0.5014             0.5606                0.2386                False
temporal            XGBoost  0.6932     0.0558     0.9181             0.5407     0.3826  0.7902 0.5094             0.5781                0.2248                False
```
