/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as path from 'path';
import * as afs from '../asyncfs';
import { StudentName } from "./StudentNameParser";
import { SessionSourceControl } from "./SessionSourceControl";
import { saveConfiguration, SessionConfiguration } from './SessionConfiguration';
import { Uri } from 'vscode';

export class Classroom {

    constructor(private templateSourceControl: SessionSourceControl, private studentSessions: StudentSession[]) { }

    async createWorkspace(): Promise<string> {
        for (let index = 0; index < this.studentSessions.length; index++) {
            const studentSession = this.studentSessions[index];

            await this.createFolderWithConfig(studentSession);
        }

        var folders: WorkspaceFolderSpec[] = this.studentSessions.map(s => <WorkspaceFolderSpec>{ name: s.identity.getEffectiveName(), path: s.identity.getEffectivePath() });
        folders = [{ name: 'Template', path: '.'}, ...folders];

        var workspaceObj = Object.create(null);
        workspaceObj["folders"] = folders;
        workspaceObj["settings"] = {};

        let workspaceAsString = JSON.stringify(workspaceObj, null, 4);

        let workspaceFilePath = path.join(this.templateSourceControl.getWorkspaceFolder().uri.fsPath, "classroom.code-workspace");
        await afs.writeFile(workspaceFilePath, workspaceAsString);

        return workspaceFilePath;
    }

    async createFolderWithConfig(studentSession: StudentSession): Promise<void> {
        let folderPath = path.join(this.templateSourceControl.getWorkspaceFolder().uri.fsPath, studentSession.identity.getEffectivePath());
        await afs.mkdirIfDoesNotExist(folderPath, 0o777);

        await saveConfiguration(Uri.file(folderPath), studentSession.sessionConfiguration);
    }
}

interface WorkspaceFolderSpec {
    name: string;
    path: string;
}

export class StudentSession {
    constructor(public readonly identity: StudentName, public readonly sessionConfiguration: SessionConfiguration) { }
}