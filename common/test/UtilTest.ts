/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as assert from 'assert';
import { Util } from '../src/util';

describe('Util', () => {

    describe('#fsPath', () => {
        it('should handle tpddl schema and encoded windows file name', () => {
            let uri = 'tpddl:/' + encodeURIComponent('c:\\folder\\file.txt');
            let fileName = Util.fsPath(uri);
            assert.equal(fileName, 'c:\\folder\\file.txt');
        });

        it('should handle tpddl schema and encoded linux file name', () => {
            let uri = 'tpddl:/' + encodeURIComponent('/folder/file.txt');
            let fileName = Util.fsPath(uri);
            assert.equal(fileName, '/folder/file.txt');
        });

        it('should handle file schema and encoded windows file name', () => {
            let uri = 'file:///' + encodeURIComponent('c:\\folder\\file.txt');
            let fileName = Util.fsPath(uri);
            assert.equal(fileName, 'c:\\folder\\file.txt');
        });
    });
})
