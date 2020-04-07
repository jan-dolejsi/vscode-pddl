import * as assert from 'assert';
import { PddlExtensionContext, utils } from 'pddl-workspace';
import { Disposable, workspace, ExtensionContext, Memento } from 'vscode';
import { assertDefined } from '../../utils';

export function assertStrictEqualDecorated(actualText: string, expectedText: string, message: string): void {
    assert.strictEqual(decorate(actualText), decorate(expectedText), message);
}

export function decorate(text: string): string {
    return text
        .split(' ').join('·')
        .split('\t').join('→')
        .split('\r').join('⤵')
        .split('\n').join('⤶');
}

export async function createTestPddlExtensionContext(): Promise<PddlExtensionContext> {
    const storagePath = await utils.atmp.dir(0o644, 'extensionTestStoragePath');

    return {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        asAbsolutePath: function (_path: string): string { throw new Error('asAbsolutePath not supported in test extension context'); },
        extensionPath: '.',
        storagePath: storagePath,
        subscriptions: new Array<Disposable>(),
        pythonPath: function (): string {
            return workspace.getConfiguration().get("python.pythonPath", "python");
        }
    };
}

class MockMemento implements Memento{
    map: Map<string, unknown>;
    constructor() {
        this.map = new Map<string, unknown>();
    }
    get<T>(key: string, defaultValue?: T): T {
        return (this.map.get(key) as T) ?? assertDefined(defaultValue, "Default value not specified");
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async update(key: string, value: any): Promise<void> {
        this.map.set(key, value);
    }
}

export async function createTestExtensionContext(): Promise<ExtensionContext> {
    const storagePath = await utils.atmp.dir(0o777, 'extensionTestStoragePath');
    const globalStoragePath = await utils.atmp.dir(0o777, 'extensionGlobalTestStoragePath');
    const logPath = (await utils.atmp.file(0o644, 'extensionTests', 'log')).path;

    return {
        asAbsolutePath: function (path: string): string { throw new Error(`Unsupported. ` + path); },
        extensionPath: '.',
        storagePath: storagePath,
        subscriptions: new Array<Disposable>(),
        globalState: new MockMemento(),
        workspaceState: new MockMemento(),
        globalStoragePath: globalStoragePath,
        logPath: logPath,
    };
}

