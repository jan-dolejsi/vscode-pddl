/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as assert from 'assert';
import { PddlWorkspace } from '../src/PddlWorkspace';

describe('PddlWorkspace', () => {
    // var subject: PddlWorkspace;

    beforeEach(function () {
        // subject = new PddlWorkspace();
    });

    describe('#getFileName', () => {
        it('should handle tpddl schema and encoded encoded windows file name', () => {
            let uri = 'tpddl:/' + encodeURIComponent('c:\\folder\\file.txt');
            let fileName = PddlWorkspace.getFileName(uri);
            assert.equal(fileName, 'file.txt');
        });

        it('should handle file schema and encoded encoded windows file name', () => {
            let uri = 'file:///' + encodeURIComponent('c:\\folder\\file.txt');
            let fileName = PddlWorkspace.getFileName(uri);
            assert.equal(fileName, 'file.txt');
        });
    });

    describe('#getFolderUri', () => {
        it('should handle tpddl schema and encoded encoded windows file name', () => {
            let uri = 'tpddl:/' + encodeURIComponent('c:\\folder\\file.txt');
            let fileName = PddlWorkspace.getFolderUri(uri);
            assert.equal(fileName, 'c:/folder');
        });

        it('should handle file schema and encoded encoded windows file name', () => {
            let uri = 'file:///' + encodeURIComponent('c:\\folder\\file.txt');
            let fileName = PddlWorkspace.getFolderUri(uri);
            assert.equal(fileName, 'c:/folder');
        });

        it('should handle longer path with file schema and encoded encoded windows file name', () => {
            let uri = 'file:///' + encodeURIComponent('c:\\folder\\sub-folder\\file.txt');
            let fileName = PddlWorkspace.getFolderUri(uri);
            assert.equal(fileName, 'c:/folder/sub-folder');
        });
    });
});
