import * as assert from 'assert';
import { PddlExtensionContext, utils } from 'pddl-workspace';
import { Disposable, workspace, ExtensionContext, Memento } from 'vscode';

export function testDisabled(_name: string, _callback: any) { }

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
        asAbsolutePath: undefined,
        extensionPath: undefined,
        storagePath: storagePath,
        subscriptions: new Array<Disposable>(),
        pythonPath: () => workspace.getConfiguration().get("python.pythonPath", "python")
    };
}

class MockMemento implements Memento{
    map: Map<string, unknown>;
    constructor() {
        this.map = new Map<string, unknown>();
    }
    get<T>(key: string, defaultValue?: T): T {
        return (this.map.get(key) as T) ?? defaultValue;
    }
    async update(key: string, value: any): Promise<void> {
        this.map.set(key, value);
    }
}

export async function createTestExtensionContext(): Promise<ExtensionContext> {
    const storagePath = await utils.atmp.dir(0o644, 'extensionTestStoragePath');
    const globalStoragePath = await utils.atmp.dir(0o644, 'extensionGlobalTestStoragePath');
    const logPath = (await utils.atmp.file(0o644, 'extensionTests', 'log')).path;

    return {
        asAbsolutePath: undefined,
        extensionPath: undefined,
        storagePath: storagePath,
        subscriptions: new Array<Disposable>(),
        globalState: new MockMemento(),
        workspaceState: new MockMemento(),
        globalStoragePath: globalStoragePath,
        logPath: logPath,
    };
}

