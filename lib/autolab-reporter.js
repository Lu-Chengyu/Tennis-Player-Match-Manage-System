'use strict';

const Mocha = require('mocha');
const fs = require('fs');

const REPORT_FILE = process.env?.REPORT_FILE || `${__dirname}/../report.json`

const BaseReporter = Mocha.reporters.Spec;

Mocha.reporters.base.symbols = {
  ok:  '+',
  err: 'x'
};

/*
  Mocha provides the following events:

start: Execution started
waiting: Execution of root Suite delayed
ready: Execution of root Suite started
end: Execution complete
suite: Test suite execution started
suite end: All tests (and sub-suites) have finished
test: Test execution started
test end: Test completed
hook: Hook execution started
hook end: Hook complete
pass: Test passed
fail: Test failed
pending: Test pending
retry: Test failed and retries

*/

const {
  EVENT_RUN_END,
  EVENT_TEST_FAIL,
  EVENT_TEST_PASS,
  EVENT_SUITE_BEGIN
} = Mocha.Runner.constants;


//module.exports = class AutolabReporter extends Mocha.reporters.Spec {
module.exports = class AutolabReporter extends BaseReporter {
  constructor(runner) {
    super(runner);

    const stats = runner.stats;
    
    let rootSuite = null;

    runner.on(EVENT_SUITE_BEGIN, (suite) => {
      if (suite.root) {
        if (rootSuite) {
          throw new Error('Reporter encountered multiple root suites, abort.');
        }

        rootSuite = suite;
      }
    });

    runner.on(EVENT_TEST_FAIL, (test) => {
      // propagate fail up
      let obj = test.parent;
      do {
        obj.passed = false;
        obj = obj.parent;
      } while(!!obj && !obj.root);
    });

    runner.on(EVENT_TEST_PASS, (test) => {
      test.passed = true;
    });

    runner.once(EVENT_RUN_END, () => {
      if(!rootSuite) {
        throw new Error('Reporter did not see a root suite, cannot generate report, abort.');
      }

      const group_fails = rootSuite.suites.filter(({ passed=true }) => !passed).length;
      const group_passes = rootSuite.suites.filter(({ passed=true }) => !!passed).length;
	
      const doc = {
        _presentation: 'semantic',
          stats,
          stats_group: {
            failures: group_fails,
            passes:   group_passes
	  },
        stages: ['Summary', 'Groups'],
        Summary: {
          'Duration (ms)': stats.duration,
          'Tests passed':  stats.passes,
          'Tests failed':  stats.failures
        },
        Groups: {}
      };

      // each 1-st level suite is a stage
      // add suite to summary and individual tests
      for (const suite of rootSuite.suites) {
        const suiteTitle = suite.fullTitle();

        doc.Groups[suiteTitle] = {
          passed: 'passed' in suite ? suite.passed === true : true
        };

        doc.stages.push(suiteTitle);

        doc[suiteTitle] = _recurse_test(suite).reduce((acc, test) =>
          Object.assign(acc, { [test.fullTitle()] : {
            passed: test.passed === true
          }}), {});
      }

      if (REPORT_FILE) {
        const output = JSON.stringify(doc);
        fs.writeFileSync(REPORT_FILE, output);
      }
    });
  }
  
  /*
    duration: test.duration,
    parents,
    state: test.state,
    speed: test.speed,
    title: test.title
  */
}


// recursively merge suite tests
const _recurse_test = s => 
  s.suites.reduce((acc, suite) =>
    acc.concat(_recurse_test(suite)), s.tests);
