/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as assert from 'assert';
import { Util } from '../src/util';
import { URI } from 'vscode-uri';
import * as path from 'path';

describe('Util', () => {

    describe('#fsPath', () => {
        it('should handle tpddl schema and windows file name', () => {
            let uri = URI.file('c:\\folder\\file.txt').with({ scheme: 'tpddl' }).toString();
            let fileName = Util.fsPath(uri);
            assert.equal(fileName, path.join('c:', 'folder', 'file.txt'));
        });

        it('should handle tpddl schema and linux file name', () => {
            let uri = URI.file('/folder/file.txt').with({ scheme: 'tpddl' }).toString();
            let fileName = Util.fsPath(uri);
            assert.equal(fileName, path.join(path.sep, 'folder', 'file.txt'));
        });

        it('should handle file schema and windows file name', () => {
            let uri = URI.file('c:\\folder\\file.txt').toString();
            let fileName = Util.fsPath(uri);
            assert.equal(fileName, path.join('c:', 'folder', 'file.txt'));
        });
    });

    describe('#q', () => {
        it('should not enclose a path wihtout spaces', () => {
            let path = "c:\\folder\\tool.exe";
            assert.equal(Util.q(path), path);
        });

        it('should enclose a path wiht spaces', () => {
            let path = "c:\\folder with space\\tool.exe";
            assert.equal(Util.q(path), '"' + path + '"');
        });

        it('should not enclose a path already enclosed', () => {
            let path = '"c:\\folder\\tool.exe"';
            assert.equal(Util.q(path), path);
        });

        it('should not enclose a path with spaces already enclosed', () => {
            let path = '"c:\\folder with spaces\\tool.exe"';
            assert.equal(Util.q(path), path);
        });

        it('should not enclose java -jar path', () => {
            let path = 'java -jar asfdsdfasdfasd.jar';
            assert.equal(Util.q(path), path);
        });

        it('should not enclose java -javaagent path', () => {
            let path = 'java -javaagent:d:/pddl4j/build/libs/pddl4j-3.8.3.jar -server -Xms2048m -Xmx2048m fr.uga.pddl4j.parser.Parser';
            assert.equal(Util.q(path), path);
        });
    });
});
