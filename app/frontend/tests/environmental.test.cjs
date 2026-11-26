const test = require("node:test");
const assert = require("node:assert/strict");

test("calendar summaries require complete eligible days and preserve units", async () => {
  const {createServer} = await import("vite");
  const vite = await createServer({server:{middlewareMode:true,hmr:false,watch:null},appType:"custom"});
  try {
    const {periods} = await vite.ssrLoadModule("/src/services/environmentPeriods.ts");
    const days = Array.from({length:366},(_,i)=>({date:new Date(Date.UTC(2024,0,1+i)).toISOString().slice(0,10),value:2,coverage:1}));
    assert.equal(periods(days,"Yearly","rainfall")[0].value,732);
    assert.equal(periods(days,"Monthly","runoff")[1].value,58);
    assert.equal(periods(days,"Yearly","moisture")[0].value,2);
    const feb = days.filter(r=>r.date.startsWith("2024-02"));
    assert.equal(periods(feb.slice(1),"Monthly","rainfall")[0].value,null);
    assert.equal(periods([...feb.slice(1),feb[1]],"Monthly","rainfall")[0].value,null);
    assert.equal(periods([{...days[0],coverage:.94}],"Daily","runoff")[0].value,null);
    assert.equal(periods([{...days[0],date:"2024-01-01T00",value:0}],"Hourly","rainfall")[0].value,0);
  } finally {await vite.close();}
});
