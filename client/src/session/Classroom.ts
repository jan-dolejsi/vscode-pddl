/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as path from 'path';
import { utils } from 'pddl-workspace';
import { StudentName } from "./StudentNameParser";
import { SessionSourceControl } from "./SessionSourceControl";
import { saveConfiguration, SessionConfiguration } from './SessionConfiguration';
import { Uri } from 'vscode';

/** Represents classroom of student sessions. */
export class Classroom {
    private readonly parentPath: string;

    constructor(private readonly templateSourceControl: SessionSourceControl, private readonly studentSessions: StudentSession[]) {
        this.parentPath = Classroom.getTemplateParentPath(templateSourceControl);
    }

    async createWorkspace(): Promise<string> {
        await Promise.all(this.studentSessions
            .map(async studentSession => await this.createFolderWithConfig(studentSession)));

        let templateFolderName = path.basename(this.templateSourceControl.getWorkspaceFolder().uri.fsPath);

        var folders: WorkspaceFolderSpec[] = this.studentSessions.map(s => <WorkspaceFolderSpec>{ name: s.identity.getEffectiveName(), path: s.identity.getEffectivePath() });
        folders = [{ name: 'Template', path: templateFolderName }, ...folders];

        var workspaceObj = Object.create(null);
        workspaceObj["folders"] = folders;
        workspaceObj["settings"] = {};

        let workspaceAsString = JSON.stringify(workspaceObj, null, 4);

        let workspaceFilePath = await this.createNewWorkspaceFile();
        await utils.afs.writeFile(workspaceFilePath, workspaceAsString);

        return workspaceFilePath;
    }

    /**
     * Creates a new workspace file to ensure no previous classroom workspace configuration is overwritten.
     */
    private async createNewWorkspaceFile(): Promise<string> {
        var filePath; var fileAlreadyExists;
        var counter = 1;
        do {
            filePath = path.join(this.parentPath, `classroom${counter++}.code-workspace`);
            fileAlreadyExists = await utils.afs.exists(filePath);
        } while (fileAlreadyExists);

        return filePath;
    }

    static getTemplateParentPath(templateSourceControl: SessionSourceControl): string {
        return path.dirname(templateSourceControl.getWorkspaceFolder().uri.fsPath);
    }

    static getSessionPath(templateSourceControl: SessionSourceControl, student: StudentName): string {
        const parentPath = Classroom.getTemplateParentPath(templateSourceControl);
        return path.join(parentPath, student.getEffectivePath());
    }

    async createFolderWithConfig(studentSession: StudentSession): Promise<void> {
        let folderPath = Classroom.getSessionPath(this.templateSourceControl, studentSession.identity);
        await utils.afs.mkdirIfDoesNotExist(folderPath, 0o644);

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