/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {
    workspace, Uri, ExtensionContext, TreeDataProvider, Event, TreeItem, EventEmitter, TreeItemCollapsibleState, window
} from 'vscode';
import { basename, join } from 'path';
import { readdirSync, statSync } from 'fs';
import { TestsManifest } from './TestsManifest';
import { TestOutcome, Test } from './Test';

export interface PTestNode {
    resource: Uri;
    kind: PTestNodeKind;
    label?: string;
}

export enum PTestNodeKind { Directory, Manifest, Test }

export class PTestTreeDataProvider implements TreeDataProvider<PTestNode> {

    private _onDidChange: EventEmitter<PTestNode> = new EventEmitter<PTestNode>();
    onDidChangeTreeData?: Event<PTestNode> = this._onDidChange.event;

    private testResults: Map<string, TestOutcome> = new Map();
    private treeNodeCache: Map<string, PTestNode> = new Map();

    constructor(private context: ExtensionContext) {

    }

    refresh() {
        this.testResults.clear();
        this.treeNodeCache.clear();
        this._onDidChange.fire();
    }

    getTestOutcome(testUri: Uri): TestOutcome {
        if (this.testResults.has(testUri.toString())) {
            return this.testResults.get(testUri.toString());
        } else {
            return TestOutcome.UNKNOWN;
        }
    }

    setTestOutcome(test: Test, testOutcome: TestOutcome) {
        this.testResults.set(test.uri.toString(), testOutcome);
        let node = this.findNodeByResource(test.uri);
        this._onDidChange.fire(node);
    }

    findNodeByResource(resource: Uri): PTestNode {
        return this.treeNodeCache.get(resource.toString());
    }

    getTreeItem(element: PTestNode): TreeItem | Thenable<TreeItem> {

        let icon: string;
        let contextValue: string

        if (element.kind == PTestNodeKind.Directory) {
            icon = 'folder_16x' + '.svg';
            contextValue = 'folder';
        } else if (element.kind == PTestNodeKind.Manifest) {
            icon = 'file_type_test' + '.svg';
            contextValue = 'manifest';
        } else {
            let testOutcome = this.getTestOutcome(element.resource);
            switch (testOutcome) {
                case TestOutcome.UNKNOWN:
                    icon = 'exclamation';
                    break;
                case TestOutcome.SUCCESS:
                    icon = 'checked';
                    break;
                case TestOutcome.FAILED:
                    icon = 'error';
                    break;
                case TestOutcome.SKIPPED:
                    icon = 'skipped';
                    break;
                case TestOutcome.IN_PROGRESS:
                    icon = 'progress';
                    break;
                default:
                    icon = 'interrogation';
            }
            icon += '.svg';
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
                let manifest = this.tryLoadManifest(parentPath);
                if (!manifest) return [];

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

    tryLoadManifest(manifestPath: string): TestsManifest {
        try {
            return TestsManifest.load(manifestPath);
        } catch (error) {
            window.showErrorMessage(`Unable to load test manifest from: ${manifestPath}
${error.message}`);
            return null;
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
