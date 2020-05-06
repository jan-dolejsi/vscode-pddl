import * as assert from 'assert';
import * as path from 'path';
import * as os from 'os';
import * as tmp from 'tmp-promise';
import { PddlExtensionContext, planner } from 'pddl-workspace';
import { Disposable, workspace, ExtensionContext, Memento, extensions, Event, FileType, Uri, ConfigurationTarget } from 'vscode';
import { assertDefined } from '../../utils';
import { CONF_PDDL } from '../../configuration/configuration';
import { CONF_PLANNERS, CONF_SELECTED_PLANNER } from '../../configuration/PlannersConfiguration';

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
    const storage = await tmp.dir({ mode: 0o644, prefix: 'extensionTestStoragePath' });

    return {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        asAbsolutePath: function (_path: string): string { throw new Error('asAbsolutePath not supported in test extension context'); },
        extensionPath: '.',
        storagePath: storage.path,
        subscriptions: new Array<Disposable>(),
        pythonPath: function (): string {
            return workspace.getConfiguration().get("python.pythonPath", "python");
        }
    };
}

class MockMemento implements Memento {
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
    const storage = await tmp.dir({ prefix: 'extensionTestStoragePath' });
    // simulate the space in the 'Application\ Support' on MacOS
    const globalStoragePrefix = os.platform() === 'darwin' ? 'extensionGlobalTest StoragePath' : 'extensionGlobalTestStoragePath';
    const globalStorage = await tmp.dir({ prefix: globalStoragePrefix });
    const log = await tmp.file({ mode: 0o644, prefix: 'extensionTests', postfix: 'log' });

    return {
        asAbsolutePath: function (path: string): string { throw new Error(`Unsupported. ` + path); },
        extensionPath: '.',
        storagePath: storage.path,
        subscriptions: new Array<Disposable>(),
        globalState: new MockMemento(),
        workspaceState: new MockMemento(),
        globalStoragePath: globalStorage.path,
        logPath: log.path,
    };
}

export class MockPlannerProvider implements planner.PlannerProvider {

    private path: string | undefined;

    constructor(private options?: { canConfigure?: boolean }) { }

    get kind(): planner.PlannerKind {
        return { kind: "mock" };
    }

    getNewPlannerLabel(): string {
        throw new Error("Method not implemented.");
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    configurePlanner(_previousConfiguration?: planner.PlannerConfiguration): Promise<planner.PlannerConfiguration> {
        return Promise.resolve({
            kind: this.kind.kind,
            canConfigure: this.options?.canConfigure ?? false,
            title: 'Mock planner',
            path: this.path ?? getMockPlanner(),
            isSelected: true
        });
    }

    setExpectedPath(path: string): void {
        this.path = path;
        this.options.canConfigure = true;
    }
}

function getMockPlanner(): string {
    const plannerPath = path.resolve(__dirname, path.join('..', '..', '..', 'src', 'test', 'planning', 'mock-planner.js'));

    return "node " + plannerPath;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function activateExtension(): Promise<any> {
    const thisExtension = assertDefined(extensions.getExtension("jan-dolejsi.pddl"), `Extension 'jan-dolejsi.pddl' not found`);
    if (!thisExtension.isActive) {
        return await thisExtension.activate();
    }
}

/**
 * Awaits a `T` event.
 * @param event event emitter to subscribe to 
 * @param param1 action to execute after subscribing to the event and filter to apply to events
 */
export async function waitFor<T>(event: Event<T>, { action: workload, filter }: { action?: () => void; filter?: (event: T) => boolean } = {}): Promise<T> {
    return new Promise<T>(resolve => {
        const subscription = event(e => {
            if ((filter && filter(e)) ?? true) {
                resolve(e);
                subscription.dispose();
            }
        });

        // if the workload action is defined, call it
        workload && workload();
    });
}

/**
 * Deletes all files in the workspace folder(s) recursively. 
 */
export async function clearWorkspaceFolder(): Promise<void> {

    if (!workspace.workspaceFolders) {
        console.warn('No workspace folder is open.');
        return;
    }
    else {

        const workspaceFolderDeletions = workspace.workspaceFolders.map(async wf => {
            const workspaceFolderEntries = await workspace.fs.readDirectory(wf.uri);

            const fileDeletions = workspaceFolderEntries
                .filter(entry => entry[0] !== '.gitkeep')
                .map(async entry => {
                    const [fileName, fileType] = entry;
                    const fileAbsPath = path.join(wf.uri.fsPath, fileName);
                    console.log(`Deleting ${fileAbsPath}/**`);
                    const recursive = fileType === FileType.Directory;
                    return await workspace.fs.delete(Uri.file(fileAbsPath), { recursive: recursive, useTrash: false });
                });

            await Promise.all(fileDeletions);
        });

        await Promise.all(workspaceFolderDeletions);
    }
}

export async function clearConfiguration(): Promise<void> {
    await workspace.getConfiguration(CONF_PDDL).update(CONF_PLANNERS, undefined, ConfigurationTarget.Global);
    await workspace.getConfiguration(CONF_PDDL).update(CONF_SELECTED_PLANNER, undefined, ConfigurationTarget.Global);

    await workspace.getConfiguration(CONF_PDDL).update(CONF_PLANNERS, undefined, ConfigurationTarget.Workspace);
    await workspace.getConfiguration(CONF_PDDL).update(CONF_SELECTED_PLANNER, undefined, ConfigurationTarget.Workspace);

    const workspaceFolderDeletions = workspace.workspaceFolders.map(async wf => {
        console.warn(`Skipped clearing of workspace-folder configuration for ${wf.name}`);
        // await workspace.getConfiguration(CONF_PDDL, wf).update(CONF_PLANNERS, undefined, ConfigurationTarget.WorkspaceFolder);
        // await workspace.getConfiguration(CONF_PDDL, wf).update(CONF_SELECTED_PLANNER, undefined, ConfigurationTarget.WorkspaceFolder);
    });

    await Promise.all(workspaceFolderDeletions);
}