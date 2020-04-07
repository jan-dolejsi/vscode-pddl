/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {
    workspace, Uri, TreeDataProvider, Event, TreeItem, EventEmitter, TreeItemCollapsibleState, window
} from 'vscode';
import { basename, join } from 'path';
import * as fs from 'fs';
import { utils } from 'pddl-workspace';
import { TestsManifest } from './TestsManifest';
import { TestOutcome, Test } from './Test';
import { PddlExtensionContext } from 'pddl-workspace';
import { assertDefined } from '../utils';

export interface PTestNode {
    resource: Uri;
    kind: PTestNodeKind;
    label?: string;
    tooltip?: string;
}

export enum PTestNodeKind { Directory, Manifest, Test }

export class PTestTreeDataProvider implements TreeDataProvider<PTestNode> {

    private _onDidChange: EventEmitter<PTestNode> = new EventEmitter<PTestNode>();
    onDidChangeTreeData?: Event<PTestNode> = this._onDidChange.event;

    private testResults: Map<string, TestOutcome> = new Map();
    private treeNodeCache: Map<string, PTestNode> = new Map();

    constructor(private context: PddlExtensionContext) {

    }

    refresh(): void {
        this.testResults.clear();
        this.treeNodeCache.clear();
        this._onDidChange.fire();
    }

    getTestOutcome(testUri: Uri): TestOutcome {
        return this.testResults.get(testUri.toString()) ?? TestOutcome.UNKNOWN;
    }

    setTestOutcome(test: Test, testOutcome: TestOutcome): void {
        this.testResults.set(test.getUri().toString(), testOutcome);
        const node = this.findNodeByResource(test.getUri());
        this._onDidChange.fire(node);
    }

    findNodeByResource(resource: Uri): PTestNode {
        return assertDefined(this.treeNodeCache.get(resource.toString()), `No node for ${resource.toString()}`);
    }

    cache(node: PTestNode): PTestNode {
        this.treeNodeCache.set(node.resource.toString(), node);
        return node;
    }

    getTreeItem(element: PTestNode): TreeItem | Thenable<TreeItem> {

        let icon: string;
        let contextValue: string;

        if (element.kind === PTestNodeKind.Directory) {
            icon = 'folder_16x' + '.svg';
            contextValue = 'folder';
        } else if (element.kind === PTestNodeKind.Manifest) {
            icon = 'file_type_test' + '.svg';
            contextValue = 'manifest';
        } else {
            const testOutcome = this.getTestOutcome(element.resource);
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

        const isCollapsible = element.kind === PTestNodeKind.Directory || element.kind === PTestNodeKind.Manifest;

        return {
            id: element.resource.toString(),
            resourceUri: element.resource,
            collapsibleState: isCollapsible ? TreeItemCollapsibleState.Collapsed : void 0,
            contextValue: contextValue,
            label: element.label,
            iconPath: this.getIcon(icon),
            tooltip: element.tooltip
        };
    }

    getIcon(fileName: string): { light: string | Uri; dark: string | Uri } | undefined {
        if (!fileName) { return undefined; }
        return {
            light: this.context.asAbsolutePath(join('images', 'light', fileName)),
            dark: this.context.asAbsolutePath(join('images', 'dark', fileName))
        };
    }

    async getChildren(element?: PTestNode): Promise<PTestNode[]> {
        if (!element) {
            if (workspace.workspaceFolders) {
                const rootNodes: PTestNode[] = workspace.workspaceFolders
                    .map(wf => this.cache({ resource: wf.uri, kind: PTestNodeKind.Directory }));

                return rootNodes;
            } else {
                return [];
            }
        }
        else {
            const parentPath = element.resource.fsPath;

            if (PTestTreeDataProvider.isTestManifest(parentPath)) {
                const manifest = this.tryLoadManifest(parentPath);
                if (!manifest) { return []; }

                return manifest.testCases
                    .map(test => this.cache({
                        resource: test.getUri(),
                        kind: PTestNodeKind.Test,
                        label: test.getLabel(),
                        tooltip: test.getDescription()
                    }));
            }
            else {
                let children: string[] = [];
                children = await utils.afs.readdir(parentPath);
                return Promise.all(children
                    .map(child => join(parentPath, child))
                    .filter(childPath => PTestTreeDataProvider.isOrHasTests(childPath))
                    .map(childPath => this.toCachedNode(childPath)));
            }
        }
    }

    toCachedNode(childPath: string): PTestNode {

        const kind = this.filePathToNodeKind(childPath);
        if (kind === PTestNodeKind.Manifest) {
            let label = childPath;
            const baseName = basename(childPath);

            if (baseName.length === PTestTreeDataProvider.PTEST_SUFFIX.length) {
                label = 'Test cases';
            } else {
                label = baseName.substring(0, baseName.length - PTestTreeDataProvider.PTEST_SUFFIX.length);
            }
            return this.cache({
                resource: Uri.file(childPath),
                kind: kind,
                label: label
            });
        }

        return this.cache({
            resource: Uri.file(childPath),
            kind: kind
        });
    }

    tryLoadManifest(manifestPath: string): TestsManifest | undefined {
        try {
            return TestsManifest.load(manifestPath, this.context);
        } catch (error) {
            window.showErrorMessage(`Unable to load test manifest from: ${manifestPath} 
${error}`);
            return undefined;
        }
    }

    filePathToNodeKind(filePath: string): PTestNodeKind {
        if (fs.statSync(filePath).isDirectory()) {
            return PTestNodeKind.Directory;
        }
        else if (PTestTreeDataProvider.isTestManifest(filePath)) {
            return PTestNodeKind.Manifest;
        }
        else {
            throw new Error("Unexpected file: " + filePath);
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    getParent?(_element: PTestNode): PTestNode | Thenable<PTestNode> {
        throw new Error("Method not implemented.");
    }

    static isOrHasTests(childPath: string): boolean {
        if (fs.statSync(childPath).isDirectory()) {
            return PTestTreeDataProvider.getAllChildrenFiles(childPath).some(filePath => this.isTestManifest(filePath));
        } else {
            return this.isTestManifest(childPath);
        }
    }

    static PTEST_SUFFIX = '.ptest.json';

    static isTestManifest(filePath: string): boolean {
        return basename(filePath).toLowerCase().endsWith(this.PTEST_SUFFIX);
    }

    static getAllChildrenFiles(dir: string): string[] {
        const fileNames: string[] = fs.readdirSync(dir);
        return fileNames
            .filter(file => file !== ".git")
            .reduce((files: string[], file: string) => {
                const filePath = join(dir, file);
                return fs.statSync(filePath).isDirectory() ?
                    files.concat(PTestTreeDataProvider.getAllChildrenFiles(filePath)) :
                    files.concat(filePath);
            },
                []);
    }
}
