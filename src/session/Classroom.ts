/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as path from 'path';
import * as fs from 'fs';
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

        const templateFolderName = path.basename(this.templateSourceControl.getWorkspaceFolder().uri.fsPath);

        let folders: WorkspaceFolderSpec[] = this.studentSessions.map(s => this.toWorkspaceFolderSpec(s));
        folders = [{ name: 'Template', path: templateFolderName }, ...folders];

        const workspaceObj = Object.create(null);
        workspaceObj["folders"] = folders;
        workspaceObj["settings"] = {};

        const workspaceAsString = JSON.stringify(workspaceObj, null, 4);

        const workspaceFilePath = await this.createNewWorkspaceFile();
        await fs.promises.writeFile(workspaceFilePath, workspaceAsString);

        return workspaceFilePath;
    }

    toWorkspaceFolderSpec(s: StudentSession): WorkspaceFolderSpec {
        return { name: s.identity.getEffectiveName(), path: s.identity.getEffectivePath() };
    }

    /**
     * Creates a new workspace file to ensure no previous classroom workspace configuration is overwritten.
     */
    private async createNewWorkspaceFile(): Promise<string> {
        let filePath; let fileAlreadyExists;
        let counter = 1;
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
        const folderPath = Classroom.getSessionPath(this.templateSourceControl, studentSession.identity);
        // todo: use workspace.fs.createDirectory
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