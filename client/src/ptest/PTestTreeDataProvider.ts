/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {
    workspace, Uri, ExtensionContext, TreeDataProvider, Event, TreeItem, EventEmitter, TreeItemCollapsibleState
} from 'vscode';
import { basename, join } from 'path';
import { readdirSync, statSync } from 'fs';
import { TestsManifest } from './TestsManifest';

export interface PTestNode {
    resource: Uri;
    kind: PTestNodeKind;
    label?: string;
}

export enum PTestNodeKind { Directory, Manifest, Test }

export class PTestTreeDataProvider implements TreeDataProvider<PTestNode> {

    private _onDidChange: EventEmitter<PTestNode> = new EventEmitter<PTestNode>();
    onDidChangeTreeData?: Event<PTestNode> = this._onDidChange.event;

    constructor(private context: ExtensionContext) {

    }

    refresh() {
        this._onDidChange.fire();
    }

    getTreeItem(element: PTestNode): TreeItem | Thenable<TreeItem> {

        let icon: string;
        let contextValue: string

        if (element.kind == PTestNodeKind.Directory) {
            icon = 'folder_16x' + '.svg';
            contextValue = 'folder';
        } else if (element.kind == PTestNodeKind.Manifest) {
            icon = 'document_16x' + '.svg';
            contextValue = 'manifest';
        } else {
            icon = 'file_type_test' + '.svg';
            contextValue = 'test';
        }

        let isCollapsible = element.kind == PTestNodeKind.Directory || element.kind == PTestNodeKind.Manifest;

        return {
            resourceUri: element.resource,
            collapsibleState: isCollapsible ? TreeItemCollapsibleState.Collapsed : void 0,
            contextValue: contextValue,
            label: element.label,
            iconPath: this.getIcon(icon)
        };
    }

    getIcon(fileName: string): any {
        if (!fileName) return null;
        return {
            light: this.context.asAbsolutePath(join('images', 'light', fileName)),
            dark: this.context.asAbsolutePath(join('images', 'dark', fileName))
        }
    }

    async getChildren(element?: PTestNode): Promise<PTestNode[]> {
        if (!element) {
            if (workspace.workspaceFolders) {
                let rootNodes: PTestNode[] = workspace.workspaceFolders
                    .map(wf => ({ resource: wf.uri, kind: PTestNodeKind.Directory }));

                return rootNodes;
            } else {
                return [];
            }
        }
        else {
            let parentPath = element.resource.fsPath;

            if (PTestTreeDataProvider.isTestManifest(parentPath)) {
                let manifest = TestsManifest.load(parentPath);
                return manifest.tests
                    .map((test, idx) => ({
                        resource: test.uri,
                        kind: PTestNodeKind.Test,
                        label: test.getLabel() || test.problem || test.getProblem() + ` (${idx + 1})`
                    }));
            }
            else {
                let children: string[] = [];
                children = await readdirSync(parentPath);
                return children
                    .map(child => join(parentPath, child))
                    .filter(childPath => PTestTreeDataProvider.isOrHasTests(childPath))
                    .map(childPath => (
                        {
                            resource: Uri.file(childPath),
                            kind: this.filePathToNodeKind(childPath)
                        })
                    );
            }
        }
    }

    filePathToNodeKind(filePath: string): PTestNodeKind {
        if (statSync(filePath).isDirectory()) {
            return PTestNodeKind.Directory;
        }
        else if (PTestTreeDataProvider.isTestManifest(filePath)) {
            return PTestNodeKind.Manifest;
        }
        else {
            throw new Error("Unexpected file: " + filePath);
        }
    }

    getParent?(element: PTestNode): PTestNode | Thenable<PTestNode> {
        element;
        throw new Error("Method not implemented.");
    }

    static isOrHasTests(childPath: string): boolean {
        if (statSync(childPath).isDirectory()) {
            return PTestTreeDataProvider.getAllChildrenFiles(childPath).some(filePath => this.isTestManifest(filePath));
        } else return this.isTestManifest(childPath);
    }

    static isTestManifest(filePath: string): boolean {
        return basename(filePath).toLowerCase().endsWith('.ptest.json');
    }

    static getAllChildrenFiles(dir: string): string[] {
        return readdirSync(dir)
            .filter(file => file != ".git")
            .reduce((files: string[], file: string) => {
                let filePath = join(dir, file);
                return statSync(filePath).isDirectory() ?
                    files.concat(PTestTreeDataProvider.getAllChildrenFiles(filePath)) :
                    files.concat(filePath);
            },
                []);
    }
}
