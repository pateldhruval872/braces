'use strict';

require('mocha');
const assert = require('assert').strict;
const stringify = require('../lib/stringify');

describe('braces.stringify()', () => {
  it('should reject deeply nested ASTs', () => {
    let ast = { type: 'text', value: 'a' };
    for (let i = 0; i < 101; i++) ast = { type: 'brace', nodes: [ast] };
    ast = { type: 'root', nodes: [ast] };
    assert.throws(() => stringify(ast), /exceeds max depth/);
  });
});
