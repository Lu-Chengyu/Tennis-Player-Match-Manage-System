'use strict';

const { assert, expect } = require('chai');

const fs = require('fs');

const DEFAULT_TIMEOUT_MS = 4e3;
const { Fixture } = require('./fixture_serverREST');


context('ejs template', function() {
  this.timeout(DEFAULT_TIMEOUT_MS);

  const fix = new Fixture();

  before(() => fix.before());
  after(() => fix.after());

  context('pages/layout.ejs', () => {
    const SRC_FILE = `${__dirname}/../views/layout.ejs`;

    it('file exists', async function () {
      const srcExists = fs.existsSync(SRC_FILE);
      expect(srcExists, `source file ${SRC_FILE} does not exist`).to.be.true;
    });
  });
});
