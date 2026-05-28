(async () => {
  const investigate = require('./agents/investigator');
  const report = await investigate('India is the biggest country in Asia');
  console.log(JSON.stringify(report, null, 2));
})();
