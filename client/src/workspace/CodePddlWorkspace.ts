/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { Uri, TextDocument } from 'vscode';
import { toLanguage } from './workspaceUtils';
import { FileInfo } from '../../../common/src/FileInfo';
import { PddlWorkspace } from '../../../common/src/PddlWorkspace';
import { DocumentPositionResolver } from '../../../common/src/DocumentPositionResolver';
import { CodeDocumentPositionResolver } from './CodeDocumentPositionResolver';
import * as afs from '../../../common/src/asyncfs';

export class CodePddlWorkspace {
    constructor(public readonly pddlWorkspace: PddlWorkspace) {

    }

    upsertFile(document: TextDocument): Promise<FileInfo> {
        return this.pddlWorkspace.upsertFile(document.uri.toString(),
            toLanguage(document), document.version, document.getText(),
            this.createPositionResolver(document));
    }

    upsertAndParseFile(document: TextDocument): Promise<FileInfo> {
        return this.pddlWorkspace.upsertAndParseFile(document.uri.toString(), toLanguage(document), document.version, document.getText(), this.createPositionResolver(document));
    }

    getFileInfoByUri<T extends FileInfo>(uri: Uri): T {
        return this.pddlWorkspace.getFileInfo(uri.toString());
    }

    getFileInfo<T extends FileInfo>(document: TextDocument): T {
        return this.getFileInfoByUri(document.uri);
    }

    async removeFile(textDoc: TextDocument): Promise<boolean> {
        let fileExists = await afs.exists(textDoc.fileName);
        return this.pddlWorkspace.removeFile(textDoc.uri.toString(), { removeAllReferences: !fileExists});
    }

    setEpsilon(epsilon: number): void {
        this.pddlWorkspace.epsilon = epsilon;
    }

    private createPositionResolver(document: TextDocument): DocumentPositionResolver {
        return new CodeDocumentPositionResolver(document);
    }
}