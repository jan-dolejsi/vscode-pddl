/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as assert from 'assert';
import { PddlWorkspace } from '../src/PddlWorkspace';
import { URI } from 'vscode-uri';
import * as path from 'path';

describe('PddlWorkspace', () => {
    // var subject: PddlWorkspace;

    beforeEach(function () {
        // subject = new PddlWorkspace();
    });

    describe('#getFileName', () => {
        it('should handle tpddl schema and encoded encoded windows file name', () => {
            let uri = URI.file('c:\\folder\\file.txt').with({ scheme: 'tpddl' }).toString();
            let fileName = PddlWorkspace.getFileName(uri);
            assert.equal(fileName, 'file.txt');
        });

        it('should handle file schema and encoded encoded windows file name', () => {
            let uri = URI.file('c:\\folder\\file.txt').toString();
            let fileName = PddlWorkspace.getFileName(uri);
            assert.equal(fileName, 'file.txt');
        });
    });

    describe('#getFolderUri', () => {
        it('should handle tpddl schema and encoded windows file name', () => {
            let uri = URI.file('c:\\folder\\file.txt').with({ scheme: 'tpddl' }).toString();
            let fileName = PddlWorkspace.getFolderPath(uri);
            assert.equal(fileName, path.join('c:', 'folder'));
        });

        it('should handle file schema and encoded windows file name', () => {
            let uri = URI.file('c:\\folder\\file.txt').toString();
            let fileName = PddlWorkspace.getFolderPath(uri);
            assert.equal(fileName, path.join('c:', 'folder'));
        });

        it('should handle longer path with file schema and encoded windows file name', () => {
            let uri = URI.file('c:\\folder\\sub-folder\\file.txt').toString();
            let fileName = PddlWorkspace.getFolderPath(uri);
            assert.equal(fileName, path.join('c:', 'folder', 'sub-folder'));
        });
    });
});
