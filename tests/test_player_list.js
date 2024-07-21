'use strict';

const { assert, expect } = require('chai');

const fs = require('fs');

const DEFAULT_TIMEOUT_MS = 4e3;
const { Fixture } = require('./fixture_serverREST');

const {
  random_string
} = require('../lib/util');


describe('frontend: player list', function () {
  const DEFAULT_PATH   = Fixture.URL_MAP.FRONT_PLAYER_LIST.path;
  const DEFAULT_METHOD = Fixture.URL_MAP.FRONT_PLAYER_LIST.method;

  this.timeout(DEFAULT_TIMEOUT_MS);

  const fix = new Fixture();

  before(() => fix.before());
  after(() => fix.after());

  context('express route', () => {
    it('route exists', async () => {
      const url = fix.url(DEFAULT_PATH);
      const { body, status, headers } = await fix.request(DEFAULT_METHOD, url);
      
      expect(status).to.be.equal(200);
    });

    it('response code is 200', async () => {
      const url = fix.url(DEFAULT_PATH);
      const { body, status, headers } = await fix.request(DEFAULT_METHOD, url);
      
      expect(status).to.be.equal(200);
    });

    it('response header, Content-Type = text/html', async () => {
      const url = fix.url(DEFAULT_PATH);
      const { headers } = await fix.request(DEFAULT_METHOD, url);

      const contentType = fix.getPropertyCaseInsensitive(headers, 'content-type');
      expect(contentType)
        .to.be.a('string')
        .and.satisfy(s => s.startsWith('text/html'), `${contentType} does not match text/html`);
    });
  });


  context('page source', () => {
    it('is valid html', async () => {
      const url = fix.url(DEFAULT_PATH);
      const { body } = await fix.request(DEFAULT_METHOD, url);
      
      fix.requireValidHtml(body);
    });
  });
});
