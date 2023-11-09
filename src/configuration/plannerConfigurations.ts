/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi 2020. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as http from 'http';
import { URL } from 'url';
import * as os from 'os';
import * as path from 'path';
import { Uri, commands, window, workspace } from 'vscode';

import { planner, OutputAdaptor, utils } from 'pddl-workspace';
import { isHttp } from '../utils';
import { PlannerExecutable } from '../planning/PlannerExecutable';
import { AsyncServiceConfiguration, PlannerAsyncService, PlannerSyncService, PlannerPackagePreviewService } from 'pddl-planning-service-client';
import { LongRunningPlannerProvider } from './plannerExecution';
import { exists } from 'pddl-workspace/dist/utils/asyncfs';
import { SchedulingService } from './SchedulingService';

export class CommandPlannerProvider implements planner.PlannerProvider {
    get kind(): planner.PlannerKind {
        return planner.WellKnownPlannerKind.COMMAND;
    }
    getNewPlannerLabel(): string {
        return "$(terminal) Input a command...";
    }

    async configurePlanner(previousConfiguration?: planner.PlannerConfiguration): Promise<planner.PlannerConfiguration | undefined> {
        const existingValue = previousConfiguration?.path;

        let newPlannerPath = await window.showInputBox({
            prompt: "Enter PDDL planner path local command",
            placeHolder: `planner.exe OR java -jar c:\\planner.jar`,
            value: existingValue,
            ignoreFocusOut: true
        });

        let syntax: string | undefined;

        if (newPlannerPath) {

            newPlannerPath = newPlannerPath.trim().replace(/\\/g, '/');

            // todo: validate that this planner actually works by sending a dummy request to it

            if (!isHttp(newPlannerPath)) {
                syntax = await this.askPlannerSyntax(previousConfiguration);
                if (syntax?.trim() === "") {
                    syntax = "$(planner) $(options) $(domain) $(problem)";
                }
            }
        }

        if (newPlannerPath && syntax) {
            return this.createPlannerConfiguration(newPlannerPath, syntax);
        } else {
            return undefined;
        }
    }

    createPlannerConfiguration(command: string, syntax: string | undefined): planner.PlannerConfiguration {
        const title = isHttp(command)
            ? command
            : path.basename(command);

        return {
            kind: this.kind.kind,
            path: command,
            syntax: syntax,
            title: title,
            canConfigure: true
        };
    }

    async askPlannerSyntax(previousConfiguration?: planner.PlannerConfiguration): Promise<string | undefined> {
        const existingValue = previousConfiguration?.syntax;

        const newPlannerOptions = await window.showInputBox({
            prompt: "In case you use command line switches and options, override the default syntax. For more info, see (the wiki)[https://github.com/jan-dolejsi/vscode-pddl/wiki/Configuring-the-PDDL-planner].",
            placeHolder: `$(planner) $(options) $(domain) $(problem)`,
            value: existingValue,
            ignoreFocusOut: true
        });

        return newPlannerOptions;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    showHelp(_output: OutputAdaptor): void {
        throw new Error("Method not implemented.");
    }
}

export class PlanutilsServerProvider extends LongRunningPlannerProvider {
    get kind(): planner.PlannerKind {
        return new planner.PlannerKind('planutils_server');
    }
    getNewPlannerLabel(): string {
        return "$(package) Planutils server (preview) URL...";
    }

    async configurePlanner(previousConfiguration?: planner.PlannerConfiguration): Promise<planner.PlannerConfiguration | undefined> {
        const existingValue = previousConfiguration?.url ?? "http://localhost:5555/package";

        const existingUri = Uri.parse(existingValue);
        const indexOf = existingValue.indexOf(existingUri.authority);
        const existingHostAndPort: [number, number] | undefined
            = indexOf > -1 ? [indexOf, indexOf + existingUri.authority.length] : undefined;

        const newPlannerUrl = await window.showInputBox({
            prompt: "Enter /package URL",
            placeHolder: `http://host:port/package`,
            valueSelection: existingHostAndPort,
            value: existingValue,
            ignoreFocusOut: true
        });

        if (!newPlannerUrl) { return undefined; }

        return this.createPlannerConfiguration(newPlannerUrl, previousConfiguration);
    }

    createPlannerConfiguration(newPlannerUrl: string, previousConfiguration?: planner.PlannerConfiguration): planner.PlannerConfiguration {
        return {
            kind: this.kind.kind,
            url: newPlannerUrl,
            title: newPlannerUrl,
            canConfigure: true,
            path: previousConfiguration?.path
        };
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    showHelp(_output: OutputAdaptor): void {
        throw new Error("Method not implemented."); // possibly show a page like https://paas-uom.org/docs/lama
    }

    /** Custom `Planner` implementation. */
    createPlanner(configuration: planner.PlannerConfiguration, plannerInvocationOptions: planner.PlannerRunConfiguration): planner.Planner {
        return PlanningAsAServiceProvider.createDefaultPlanner(configuration, plannerInvocationOptions, this);
    }

    /** Default `Planner` implementation. */
    static createDefaultPlanner(configuration: planner.PlannerConfiguration, plannerInvocationOptions: planner.PlannerRunConfiguration, plannerProvider?: planner.PlannerProvider): planner.Planner {
        if (!configuration.url) {
            throw new Error(`Planner ${configuration.title} does not specify 'url'.`);
        }

        const providerConfiguration: planner.ProviderConfiguration = {
            configuration: configuration,
            provider: plannerProvider
        };

        return new PlannerPackagePreviewService(configuration.url, plannerInvocationOptions, providerConfiguration);
    }

    /**
     * Checks if the server is responsive
     * @param configuration planning service configuration
     * @returns true of the service responds
     */
    async isServiceAccessible(configuration: planner.PlannerConfiguration): Promise<boolean> {
        const url = configuration.url;
        if (!url) {
            throw new Error(`Expected planning configuration with the 'url' attribute.`);
        }

        return new Promise<boolean>(resolve => {
            const req = http.request(new URL(url), { method: 'post' }, response => {
                resolve((response.statusCode !== undefined) && (response.statusCode >= 400));
            }).once("error", () => {
                resolve(false);
            });
            req.write(JSON.stringify({ domain: "", problem: "" }));
            req.end();
        });
    }
}

export class PlanningAsAServiceProvider extends LongRunningPlannerProvider {
    get kind(): planner.PlannerKind {
        return planner.WellKnownPlannerKind.PLANNING_AS_A_SERVICE_PREVIEW;
    }
    getNewPlannerLabel(): string {
        return "$(package) Planning-as-a-service (preview) URL...";
    }

    async configurePlanner(previousConfiguration?: planner.PlannerConfiguration): Promise<planner.PlannerConfiguration | undefined> {
        const existingValue = previousConfiguration?.url ?? "https://paas-uom.org/package";

        const existingUri = Uri.parse(existingValue);
        const indexOf = existingValue.indexOf(existingUri.authority);
        const existingHostAndPort: [number, number] | undefined
            = indexOf > -1 ? [indexOf, indexOf + existingUri.authority.length] : undefined;

        const newPlannerUrl = await window.showInputBox({
            prompt: "Enter /package URL",
            placeHolder: `http://host:port/package`,
            valueSelection: existingHostAndPort,
            value: existingValue,
            ignoreFocusOut: true
        });

        if (!newPlannerUrl) { return undefined; }

        return this.createPlannerConfiguration(newPlannerUrl, previousConfiguration);
    }

    createPlannerConfiguration(newPlannerUrl: string, previousConfiguration?: planner.PlannerConfiguration): planner.PlannerConfiguration {
        return {
            kind: this.kind.kind,
            url: newPlannerUrl,
            title: newPlannerUrl,
            canConfigure: true,
            path: previousConfiguration?.path
        };
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    showHelp(_output: OutputAdaptor): void {
        throw new Error("Method not implemented."); // possibly show a page like https://paas-uom.org/docs/lama
    }

    /** Custom `Planner` implementation. */
    createPlanner(configuration: planner.PlannerConfiguration, plannerInvocationOptions: planner.PlannerRunConfiguration): planner.Planner {
        return PlanningAsAServiceProvider.createDefaultPlanner(configuration, plannerInvocationOptions, this);
    }

    /** Default `Planner` implementation. */
    static createDefaultPlanner(configuration: planner.PlannerConfiguration, plannerInvocationOptions: planner.PlannerRunConfiguration, plannerProvider?: planner.PlannerProvider): planner.Planner {
        if (!configuration.url) {
            throw new Error(`Planner ${configuration.title} does not specify 'url'.`);
        }

        const providerConfiguration: planner.ProviderConfiguration = {
            configuration: configuration,
            provider: plannerProvider
        };

        return new PlannerPackagePreviewService(configuration.url, plannerInvocationOptions, providerConfiguration);
    }

    /**
     * Checks if the server is responsive
     * @param configuration planning service configuration
     * @returns true of the service responds
     */
    async isServiceAccessible(configuration: planner.PlannerConfiguration): Promise<boolean> {
        const url = configuration.url;
        if (!url) {
            throw new Error(`Expected planning configuration with the 'url' attribute.`);
        }

        return new Promise<boolean>(resolve => {
            const req = http.request(new URL(url), { method: 'post' }, response => {
                resolve((response.statusCode !== undefined) && (response.statusCode >= 400));
            }).once("error", () => {
                resolve(false);
            });
            req.write(JSON.stringify({ domain: "", problem: "" }));
            req.end();
        });
    }
}

export class SolveServicePlannerProvider extends LongRunningPlannerProvider {
    get kind(): planner.PlannerKind {
        return planner.WellKnownPlannerKind.SERVICE_SYNC;
    }
    getNewPlannerLabel(): string {
        return "$(cloud-upload) Input a sync. service URL...";
    }

    async configurePlanner(previousConfiguration?: planner.PlannerConfiguration): Promise<planner.PlannerConfiguration | undefined> {
        const existingValue = previousConfiguration?.url ?? "https://solver.planning.domains/solve";

        const existingUri = Uri.parse(existingValue);
        const indexOf = existingValue.indexOf(existingUri.authority);
        const existingHostAndPort: [number, number] | undefined
            = indexOf > -1 ? [indexOf, indexOf + existingUri.authority.length] : undefined;

        const newPlannerUrl = await window.showInputBox({
            prompt: "Enter synchronous service URL",
            placeHolder: `http://host:port/solve`,
            valueSelection: existingHostAndPort,
            value: existingValue,
            ignoreFocusOut: true
        });

        if (!newPlannerUrl) { return undefined; }

        return this.createPlannerConfiguration(newPlannerUrl, previousConfiguration);
    }

    createPlannerConfiguration(newPlannerUrl: string, previousConfiguration?: planner.PlannerConfiguration): planner.PlannerConfiguration {
        return {
            kind: this.kind.kind,
            url: newPlannerUrl,
            title: newPlannerUrl,
            canConfigure: true,
            path: previousConfiguration?.path
        };
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    showHelp(_output: OutputAdaptor): void {
        throw new Error("Method not implemented.");
    }

    /** Custom `Planner` implementation. */
    createPlanner(configuration: planner.PlannerConfiguration, plannerInvocationOptions: planner.PlannerRunConfiguration): planner.Planner {
        return SolveServicePlannerProvider.createDefaultPlanner(configuration, plannerInvocationOptions, this);
    }

    /** Default `Planner` implementation. */
    static createDefaultPlanner(configuration: planner.PlannerConfiguration, plannerInvocationOptions: planner.PlannerRunConfiguration, plannerProvider?: planner.PlannerProvider): planner.Planner {
        if (!configuration.url) {
            throw new Error(`Planner ${configuration.title} does not specify 'url'.`);
        }

        const providerConfiguration: planner.ProviderConfiguration = {
            configuration: configuration,
            provider: plannerProvider
        };

        return new PlannerSyncService(configuration.url, plannerInvocationOptions, providerConfiguration);
    }

    /**
     * Checks if the server is responsive
     * @param configuration planning service configuration
     * @returns true of the service responds
     */
    async isServiceAccessible(configuration: planner.PlannerConfiguration): Promise<boolean> {
        const url = configuration.url;
        if (!url) {
            throw new Error(`Expected planning configuration with the 'url' attribute.`);
        }

        return new Promise<boolean>(resolve => {
            const req = http.request(new URL(url), { method: 'post' }, response => {
                resolve((response.statusCode !== undefined) && (response.statusCode >= 400));
            }).once("error", () => {
                resolve(false);
            });
            req.write(JSON.stringify({ domain: "", problem: "" }));
            req.end();
        });
    }
}

export class RequestServicePlannerProvider extends LongRunningPlannerProvider {
    get kind(): planner.PlannerKind {
        return planner.WellKnownPlannerKind.SERVICE_ASYNC;
    }
    getNewPlannerLabel(): string {
        // compare-changes, $(arrow-both)
        return "$(cloud-upload)$(cloud-download) Input a async. service URL...";
    }

    async configurePlanner(previousConfiguration?: planner.PlannerConfiguration): Promise<planner.PlannerConfiguration | undefined> {
        const existingValue = previousConfiguration?.url ?? "http://localhost:8080/request";

        const existingUri = Uri.parse(existingValue);
        const indexOf = existingValue.indexOf(existingUri.authority);
        const existingHostAndPort: [number, number] | undefined
            = indexOf > -1 ? [indexOf, indexOf + existingUri.authority.length] : undefined;

        const newPlannerUrl = await window.showInputBox({
            prompt: "Enter asynchronous service URL",
            placeHolder: `http://host:port/request`,
            valueSelection: existingHostAndPort, //
            value: existingValue,
            ignoreFocusOut: true
        });

        if (!newPlannerUrl) { return undefined; }

        return this.createPlannerConfiguration(newPlannerUrl, previousConfiguration);
    }

    createPlannerConfiguration(newPlannerUrl: string, previousConfiguration?: planner.PlannerConfiguration): planner.PlannerConfiguration {
        return {
            kind: this.kind.kind,
            url: newPlannerUrl,
            title: newPlannerUrl,
            canConfigure: true,
            path: previousConfiguration?.path
        };
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    showHelp(_output: OutputAdaptor): void {
        throw new Error("Method not implemented.");
    }

    /** Custom `Planner` implementation. */
    createPlanner(configuration: planner.PlannerConfiguration, plannerInvocationOptions: planner.PlannerRunConfiguration): planner.Planner {
        return RequestServicePlannerProvider.createDefaultPlanner(configuration, plannerInvocationOptions as AsyncServiceConfiguration, this);
    }

    /** Default `Planner` implementation. */
    static createDefaultPlanner(configuration: planner.PlannerConfiguration, plannerInvocationOptions: AsyncServiceConfiguration, plannerProvider?: planner.PlannerProvider): planner.Planner {
        if (configuration.url === undefined) {
            throw new Error(`Planner ${configuration.title} does not specify 'url'.`);
        }

        const providerConfiguration: planner.ProviderConfiguration = {
            configuration: configuration,
            provider: plannerProvider
        };
        return new PlannerAsyncService(configuration.url, plannerInvocationOptions, providerConfiguration);
    }

    /**
     * Checks if the server is responsive
     * @param configuration planning service configuration
     * @returns true of the service responds
     */
    async isServiceAccessible(configuration: planner.PlannerConfiguration): Promise<boolean> {
        const url = configuration.url;
        if (!url) {
            throw new Error(`Expected planning configuration with the 'url' attribute.`);
        }

        return new Promise<boolean>(resolve => {
            const req = http.request(new URL(url), { method: 'post' }, response => {
                resolve((response.statusCode !== undefined) && (response.statusCode >= 400));
            }).once("error", () => {
                resolve(false);
            });
            req.write(JSON.stringify(this.createDummyRequestBody()));
            req.end();
        });
    }

    private createDummyRequestBody(): unknown {
        return {
            'domain': {
                'name': 'dummy-domain',
                'format': 'PDDL',
                'content': '' // empty
            },
            'problem': {
                'name': 'dummy-problem',
                'format': 'PDDL',
                'content': '' // empty
            },
            'configuration': {}
        };
    }
}

// move to planner.WellKnownPlannerKind
const SCHEDULER_SERVICE_SYNC = new planner.PlannerKind("scheduler");

export class SchedulingServiceProvider extends LongRunningPlannerProvider {
    get kind(): planner.PlannerKind {
        return SCHEDULER_SERVICE_SYNC;
    }
    getNewPlannerLabel(): string {
        return "$(calendar) Input a scheduling service URL...";
    }

    async configurePlanner(previousConfiguration?: planner.PlannerConfiguration): Promise<planner.PlannerConfiguration | undefined> {
        const existingValue = previousConfiguration?.url ?? "http://localhost:8091/scheduling";

        const existingUri = Uri.parse(existingValue);
        const indexOf = existingValue.indexOf(existingUri.authority);
        const existingHostAndPort: [number, number] | undefined
            = indexOf > -1 ? [indexOf, indexOf + existingUri.authority.length] : undefined;

        const newPlannerUrl = await window.showInputBox({
            prompt: "Enter scheduling service URL",
            placeHolder: `http://host:port/scheduling`,
            valueSelection: existingHostAndPort,
            value: existingValue,
            ignoreFocusOut: true
        });

        if (!newPlannerUrl) { return undefined; }

        return this.createPlannerConfiguration(newPlannerUrl, previousConfiguration);
    }

    createPlannerConfiguration(newPlannerUrl: string, previousConfiguration?: planner.PlannerConfiguration): planner.PlannerConfiguration {
        return {
            kind: this.kind.kind,
            url: newPlannerUrl,
            title: newPlannerUrl,
            canConfigure: true,
            path: previousConfiguration?.path
        };
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    showHelp(_output: OutputAdaptor): void {
        throw new Error("Method not implemented.");
    }

    /** Custom `Planner` implementation. */
    createPlanner(configuration: planner.PlannerConfiguration, plannerInvocationOptions: planner.PlannerRunConfiguration): planner.Planner {
        return SchedulingServiceProvider.createDefaultPlanner(configuration, plannerInvocationOptions, this);
    }

    /** Default `Planner` implementation. */
    static createDefaultPlanner(configuration: planner.PlannerConfiguration, plannerInvocationOptions: planner.PlannerRunConfiguration, plannerProvider?: planner.PlannerProvider): planner.Planner {
        if (!configuration.url) {
            throw new Error(`Planner ${configuration.title} does not specify 'url'.`);
        }

        const providerConfiguration: planner.ProviderConfiguration = {
            configuration: configuration,
            provider: plannerProvider
        };

        return new SchedulingService(configuration.url, plannerInvocationOptions, providerConfiguration);
    }

    /**
     * Checks if the server is responsive
     * @param configuration planning service configuration
     * @returns true of the service responds
     */
    async isServiceAccessible(configuration: planner.PlannerConfiguration): Promise<boolean> {
        const url = configuration.url;
        if (!url) {
            throw new Error(`Expected planning configuration with the 'url' attribute.`);
        }

        return new Promise<boolean>(resolve => {
            const req = http.request(new URL(url), { method: 'post' }, response => {
                resolve((response.statusCode !== undefined) && (response.statusCode >= 400));
            }).once("error", () => {
                resolve(false);
            });
            // todo: different schema or multipart ....
            req.write(JSON.stringify({ domain: "", problem: "" }));
            req.end();
        });
    }
}

export class JavaPlannerProvider implements planner.PlannerProvider {
    get kind(): planner.PlannerKind {
        return planner.WellKnownPlannerKind.JAVA_JAR;
    }
    getNewPlannerLabel(): string {
        return "$(file-binary) Select a Java JAR file...";
    }

    async configurePlanner(previousConfiguration?: planner.PlannerConfiguration): Promise<planner.PlannerConfiguration | undefined> {
        const filters =
        {
            'Java executable archive': ['jar'],
        };

        const defaultUri = previousConfiguration?.path ? Uri.file(previousConfiguration.path) : undefined;

        const executableUri = await selectedFile(`Select executable JAR`, defaultUri, filters);
        if (!executableUri) { return undefined; }

        const newPlannerConfiguration: planner.PlannerConfiguration = {
            kind: this.kind.kind,
            canConfigure: true,
            path: executableUri.fsPath,
            title: path.basename(executableUri.fsPath)
        };

        return newPlannerConfiguration;
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    showHelp(_output: OutputAdaptor): void {
        // do nothing
    }
    createPlanner(configuration: planner.PlannerConfiguration, plannerRunConfiguration: planner.PlannerRunConfiguration): planner.Planner {
        if (!configuration.path) {
            throw new Error('Incomplete planner configuration. Mandatory attributes: path');
        }

        const providerConfiguration: planner.ProviderConfiguration = {
            configuration: configuration,
            provider: this
        };
        // todo: use `java.home` (deprecated) or `java.jdt.ls.java.home` setting
        return new PlannerExecutable(`java -jar ${utils.Util.q(configuration.path)}`,
            plannerRunConfiguration as planner.PlannerExecutableRunConfiguration, providerConfiguration);
    }
}

export class Pddl4jProvider extends JavaPlannerProvider {
    get kind(): planner.PlannerKind {
        return new planner.PlannerKind('pddl4j');
    }
    getNewPlannerLabel(): string {
        return "$(file-binary) Select a pddl4j-<ver>.jar Java JAR file...";
    }

    async configurePlanner(previousConfiguration?: planner.PlannerConfiguration): Promise<planner.PlannerConfiguration | undefined> {
        const filters =
        {
            'Java pddl4j-<ver>.jar': ['jar'],
        };

        const defaultUri = previousConfiguration?.path ? Uri.file(previousConfiguration.path) : undefined;

        const executableUri = await selectedFile(`Select pddl4j-<ver>.jar`, defaultUri, filters);
        if (!executableUri) { return undefined; }

        const newPlannerConfiguration: planner.PlannerConfiguration = {
            kind: this.kind.kind,
            canConfigure: true,
            path: executableUri.fsPath,
            title: path.basename(executableUri.fsPath).replace('.jar', ''),
            syntax: '$(planner) -o $(domain) -f $(problem) $(options)',
        };

        return newPlannerConfiguration;
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    showHelp(_output: OutputAdaptor): void {
        // do nothing
    }
    getPlannerOptions(): planner.PlannerOption[] {
        return [
            { label: "-w <num>", option: "-w 1", description: "weight used in the a star search (default: 1)" },
            { label: "-t <num>", option: "-t 300", description: "specifies the maximum CPU-time in seconds (preset: 300)" },

            { option: "-p 0", description: "HSP planner. Simple forward planner based on A* algorithm (default)" },
            { option: "-p 1", description: "FF planner. Fast Forward planner based on Enforced Hill Climbing Algorithm and Greedy Best First Search" },
            { option: "-p 2", description: "FF Anytime planner" },
                 
            { option: "-u 0", description: "ff heuristic" },
            { option: "-u 1", description: "sum heuristic" },
            { option: "-u 2", description: "sum mutex heuristic" },
            { option: "-u 3", description: "adjusted sum heuristic" },
            { option: "-u 4", description: "adjusted sum 2 heuristic" },
            { option: "-u 5", description: "adjusted sum 2M heuristic" },
            { option: "-u 6", description: "combo heuristic" },
            { option: "-u 7", description: "max heuristic" },
            { option: "-u 8", description: "set-level heuristic" },
            { option: "-u 9", description: "min cost heuristic" },
            
            { label: "-i", option: "-i 1", description: "run-time information level from 0 to 8, see -h (preset: 1)" },
            { label: "-s", option: "-s false", description: "generate statistics (default: true)" },
            { label: "-d", option: "-d true", description: "print cost in solution plan (preset: false)" },
            { option: "-h", description: "print help" },
        ];
    }
}

export class ExecutablePlannerProvider implements planner.PlannerProvider {
    get kind(): planner.PlannerKind {
        return planner.WellKnownPlannerKind.EXECUTABLE;
    }
    getNewPlannerLabel(): string {
        return "$(symbol-event) Select an executable on this computer...";
    }

    async configurePlanner(previousConfiguration?: planner.PlannerConfiguration): Promise<planner.PlannerConfiguration | undefined> {
        const filters = os.platform() === 'win32' ?
            {
                'Executable or batch file': ['exe', 'bat', 'cmd'],
                'Executable': ['exe'],
                'Batch file': ['bat', 'cmd'],
                'All files': ['*']
            }
            : undefined;

        const defaultUri = previousConfiguration?.path ? Uri.file(previousConfiguration.path) : undefined;

        const executableUri = await selectedFile(`Select planner executable`, defaultUri, filters);
        if (!executableUri) { return undefined; }

        const newPlannerConfiguration: planner.PlannerConfiguration = {
            kind: this.kind.kind,
            canConfigure: true,
            path: executableUri.fsPath,
            title: path.basename(executableUri.fsPath)
        };

        return newPlannerConfiguration;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    showHelp(_output: OutputAdaptor): void {
        throw new Error("Method not implemented.");
    }
}

export class Popf implements planner.PlannerProvider {

    get kind(): planner.PlannerKind {
        return new planner.PlannerKind('popf');
    }

    getNewPlannerLabel(): string {
        return '$(mortar-board) POPF';
    }

    async configurePlanner(previousConfiguration?: planner.PlannerConfiguration | undefined): Promise<planner.PlannerConfiguration | undefined> {

        const filters = os.platform() === 'win32' ?
            {
                'POPF Executable': ['exe']
            }
            : undefined;

        const defaultUri: Uri | undefined = !!(previousConfiguration?.path) ?
            Uri.file(previousConfiguration.path) :
            undefined;

        const popfUri = await selectedFile(`Select POPF`, defaultUri, filters);
        if (!popfUri) { return undefined; }

        const newPlannerConfiguration: planner.PlannerConfiguration = {
            kind: this.kind.kind,
            canConfigure: true,
            path: popfUri.fsPath,
            syntax: '$(planner) $(options) $(domain) $(problem)',
            title: 'POPF'
        };

        return newPlannerConfiguration;
    }

    getPlannerOptions(): planner.PlannerOption[] {
        return [
            { option: "-n", description: "Continuous searching after the first plan is reached in quest for alternative plans with a better metric" },
            { option: "-citation", description: "Display citation to relevant conference paper (ICAPS 2010)" },
            { option: "-b", description: "Disable best-first search - if EHC fails, abort" },
            { option: "-E", description: "Skip EHC: go straight to best-first search" },
            { option: "-e", description: "Use standard EHC instead of steepest descent" },
            { option: "-h", description: "Disable helpful-action pruning" },
            { option: "-k", description: "Disable compression-safe action detection" },
            { option: "-c", description: "Enable the tie-breaking in RPG that favour actions that slot into the partial order earlier" },
            { option: "-S", description: "Sort initial layer facts in RPG by availability order (only use if using -c)" },
            { option: "-m", description: "Disable the tie-breaking in search that favours plans with shorter makespans" },
            { option: "-F", description: "Full FF helpful actions (rather than just those in the RP applicable in the current state)" },
            { option: "-I", description: "Disable the hybrid Bellman-Ford--LP solver" },
            { option: "-T", description: "Rather than building a partial order, build a total-order" },
            // { option: "-J123", description: "Generate search graph" },
            { option: "-v16", description: "Info about RPG generation instanciation of action found (Number of applicable actions)" },
            { option: "-v64", description: "Numeric fluents output" },
            { option: "-v1048576", description: "Verbose output details the relaxed plan for each action applied (in the standard output)." },
            { option: "-L4", description: "Prints out some LP stuff to the console " },
            { option: "-L8", description: "Outputs the LP program into a stateevaluation.lp file" },
            { option: "-L16", description: "Generates the lp program with bounds of the state variables; but overwrites the files, so you only get files for the last variable" },
        ];
    }
}

export class Lpg implements planner.PlannerProvider {

    get kind(): planner.PlannerKind {
        return new planner.PlannerKind('lpg-td');
    }

    getNewPlannerLabel(): string {
        return '$(mortar-board) LPG-td';
    }

    async configurePlanner(previousConfiguration?: planner.PlannerConfiguration | undefined): Promise<planner.PlannerConfiguration | undefined> {

        const filters = os.platform() === 'win32' ?
            {
                'LPG-td Executable': ['exe']
            }
            : undefined;

        const defaultUri: Uri | undefined = !!(previousConfiguration?.path) ?
            Uri.file(previousConfiguration.path) :
            undefined;

        const popfUri = await selectedFile(`Select LPG-td`, defaultUri, filters);
        if (!popfUri) { return undefined; }

        const newPlannerConfiguration: planner.PlannerConfiguration = {
            kind: this.kind.kind,
            canConfigure: true,
            path: popfUri.fsPath,
            syntax: '$(planner) -o $(domain) -f $(problem) $(options)',
            title: 'LPG-td'
        };

        return newPlannerConfiguration;
    }

    createPlanner(configuration: planner.PlannerConfiguration, plannerRunConfiguration: planner.PlannerRunConfiguration): planner.Planner {
        if (!plannerRunConfiguration.options) {
            // ensure mandatory option is set
            plannerRunConfiguration.options = "-n 1";
        }

        if (!configuration.path) {
            throw new Error('Incomplete planner configuration. Mandatory attributes: path');
        }

        const providerConfiguration: planner.ProviderConfiguration = {
            configuration: configuration,
            provider: this
        };

        return new PlannerExecutable(configuration.path,
            plannerRunConfiguration as planner.PlannerExecutableRunConfiguration, providerConfiguration);
    }

    getPlannerOptions(): planner.PlannerOption[] {
        // see https://lpg.unibs.it/lpg/README-LPGTD
        return [
            {
                option: "-speed", description: "finds a solution (of any quality) as quickly as possible"
            }, {
                option: "-quality", description: "slower than in speed mode, but the planner finds a solution with better quality"
            }, {
                label: "-n <max number of desired solutions>", option: "-n 3"
            }, {
                option: "-noout", description: "no output file is produced"
            }, {
                option: "-v off", description: "switches off the verbose output of LPG (the planner provides only essential information)"
            }, {
                label: "-search_steps <integer>",
                option: "-search_steps 500", description: "Specifies the initial number of search steps after which the search is "
                    + "restarted. After each search restart, this number is automatically "
                    + "incremented by a factor of 1.1. The default initial value for -search_steps "
                    + "is 500.  Note that for simple problems this value could be significantly "
                    + "reduced, obtaining better performance."

            }, {
                label: "-restarts <integer>",
                option: "-restarts 9", description: `maximum number of search restarts after which the search `
                    + `is repeated for a certain number of times(see the "-repeat" parameter). `
                    + `After each restart, the value of some dynamic parameters (e.g., number `
                    + `of search step) is automatically changed. The default value of -restarts `
                    + `is 9.`

            }, {
                option: "-repeats 5",
                label: "-repeats <integer>", description: `maximum number of times (repeats) the local search is `
                    + `repeated to find the first solution. If no solution has been found within `
                    + `the specified number of repeats (and the CPU-time limit for the local `
                    + `search has not been exceeded), the best-first search is activated. `
                    + `Each time the local search is repeated, the dynamic settings of the `
                    + `planner (e.g., the number of search steps) are set to their initial value. `
                    + `When LPG-td is run in quality mode or incremental mode ("-n x", x > 1), `
                    + `if a solution is found by the local search (under the specified CPU-time `
                    + `limit and number of repeats), the local search is repeated until the `
                    + `CPU-time limit of the local search is reached, or the number of solutions `
                    + `specified by the "-n" parameter have been found. `
                    + `The default value of -repeats is 5. `

            }, {
                option: "-noise 0.1",
                label: "-noise <number between 0 and 1>", description: `Specifies the initial noise value for Walkplan. Such value is dynamically `
                    + `modified during each restart using a technique described in in Gerevini, `
                    + `Saetti, Serina "An Empirical Analysis of Some Heuristic Features for Local `
                    + `Search in LPG", ICAPS'04. The default value of -noise is 0.1. `

            }, {
                option: "-maxnoise <number>", description: "Specifies the maximum noise value that can (automatically) be reached by "
                    + "the dynamic noise.  "

            }, {
                option: "-static_noise 0.1",
                label: "-static_noise", description: `Switches off the dynamic noise during each restart. The value of the  `
                    + `noise is fixed. The default value is 0.1, and it can be changed by using `
                    + `the "-noise" parameter. `

            }, {
                label: "-seed <integer>", option: "-seed 2004",
                description: `Specifies the seed for the random number generator used by Walkplan  `
                    + `(a stochastic local search procedure). By using the same seed number,  `
                    + `it is possible to repeat identical runs. The output files containing the `
                    + `solutions produced by LPG include the seed number used by the planner to `
                    + `generate them. In the 4th IPC, we used "-seed 2004". `

            }, {
                option: "-lowmemory", description: `With this option, the mutex relations between actions are computed at `
                    + `runtime (instead of being computed before searching). We recommend the `
                    + `use of this option only for very large problems. `

            }, {
                label: "-cputime <sec>", option: "-cputime 1800",
                description: "Specifies the maximum CPU-time (in seconds) after which termination of  "
                    + "the planning process is forced. The default value is 1800 (30 minutes). "

            }, {
                label: "-cputime_localsearch <sec>", option: "-cputime_localsearch 1200",
                description: `When all restarts of the local search have been performed without finding `
                    + `a solution, LPG runs in a best-first search based on Joerg Hoffman's `
                    + `implementation (FF package v2.3). This option specifies the maximum `
                    + `CPU-time (in seconds) after which the best-first search starts.  `
                    + `The default value is 1200 (20 minutes). `

            }, {
                option: "-nobestfirst", description: "With this option, LPG-td does not run best-first search. "

            }, {
                option: "-onlybestfirst", description: "Forces the immediate run of the best-first search (no local search is performed).  "

            }, {
                option: "-timesteps", description: "This option can be used in STRIPS domains to define the plan quality  "
                    + "metric as number of (Graphplan) time steps. "
            },
        ];
    }
}

export class NodeJsPlannerProvider implements planner.PlannerProvider {
    get kind(): planner.PlannerKind {
        return planner.WellKnownPlannerKind.NODE_JS_SCRIPT;
    }
    getNewPlannerLabel(): string {
        return "$(file-code) Select a Node.js javascript file...";
    }

    async configurePlanner(previousConfiguration?: planner.PlannerConfiguration): Promise<planner.PlannerConfiguration | undefined> {
        const filters =
        {
            'Javascript script': ['js', 'mjs', 'cjs'],
        };

        const defaultUri = previousConfiguration?.path ? Uri.file(previousConfiguration.path) : undefined;

        const executableUri = await selectedFile(`Select Node.js script`, defaultUri, filters);
        if (!executableUri) { return undefined; }

        const newPlannerConfiguration: planner.PlannerConfiguration = {
            kind: this.kind.kind,
            canConfigure: true,
            path: executableUri.fsPath,
            title: path.basename(executableUri.fsPath)
        };

        return newPlannerConfiguration;
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    showHelp(_output: OutputAdaptor): void {
        // do nothing
    }
    async createPlanner(configuration: planner.PlannerConfiguration, plannerRunConfiguration: planner.PlannerRunConfiguration): Promise<planner.Planner> {
        if (!configuration.path) {
            throw new Error('Incomplete planner configuration. Mandatory attributes: path');
        }

        const providerConfiguration: planner.ProviderConfiguration = {
            configuration: configuration,
            provider: this
        };
        return new PlannerExecutable(`node ${utils.Util.q(configuration.path)}`,
            plannerRunConfiguration as planner.PlannerExecutableRunConfiguration, providerConfiguration);
    }
}


export class PythonPlannerProvider implements planner.PlannerProvider {
    get kind(): planner.PlannerKind {
        return planner.WellKnownPlannerKind.PYTHON_SCRIPT;
    }
    getNewPlannerLabel(): string {
        return "$(file-text) Select a Python file...";
    }

    async configurePlanner(previousConfiguration?: planner.PlannerConfiguration): Promise<planner.PlannerConfiguration | undefined> {
        const filters =
        {
            'Python script': ['py'],
        };

        const defaultUri = previousConfiguration?.path ? Uri.file(previousConfiguration.path) : undefined;

        const executableUri = await selectedFile(`Select Python script`, defaultUri, filters);
        if (!executableUri) { return undefined; }

        const newPlannerConfiguration: planner.PlannerConfiguration = {
            kind: this.kind.kind,
            canConfigure: true,
            path: executableUri.fsPath,
            title: path.basename(executableUri.fsPath)
        };

        return newPlannerConfiguration;
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    showHelp(_output: OutputAdaptor): void {
        // do nothing
    }
    async createPlanner(configuration: planner.PlannerConfiguration, plannerRunConfiguration: planner.PlannerRunConfiguration): Promise<planner.Planner> {
        if (!configuration.path) {
            throw new Error('Incomplete planner configuration. Mandatory attributes: path');
        }

        const providerConfiguration: planner.ProviderConfiguration = {
            configuration: configuration,
            provider: this
        };

        let interpreter: string | undefined = undefined;
        try {
            interpreter = (await commands.executeCommand<string>("python.interpreterPath"));
        } catch (err: unknown) {
            console.log('Failed to get the python interpreter: ' + err);
            interpreter = workspace.getConfiguration().get<string>("python.defaultInterpreterPath");
        }

        if (!interpreter || !await exists(interpreter)) {
            interpreter = 'python';
        }

        return new PlannerExecutable(`${interpreter} ${utils.Util.q(configuration.path)}`,
            plannerRunConfiguration as planner.PlannerExecutableRunConfiguration, providerConfiguration);
    }
}


async function selectedFile(label: string, defaultUri?: Uri, filters?: { [name: string]: string[] }): Promise<Uri | undefined> {
    const selectedUris = await window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        openLabel: label,
        filters: filters,
        defaultUri: defaultUri
    });

    if (!selectedUris) {
        return undefined;
    }

    return selectedUris[0];
}
