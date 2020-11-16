import { expect, use, assert } from 'chai';
// eslint-disable-next-line @typescript-eslint/no-var-requires
use(require('chai-string'));
import { before, after } from 'mocha';

import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { ValDownloader } from '../../validation/ValDownloader';
import { PddlConfiguration, CONF_PDDL, VAL_STEP_PATH, VALIDATION_PATH, VALUE_SEQ_PATH, PDDL_PARSER, PARSER_EXECUTABLE_OR_SERVICE, EXECUTABLE_OR_SERVICE } from '../../configuration/configuration';
import { createTestExtensionContext } from './testUtils';
import { utils } from 'pddl-workspace';
import { assertDefined } from '../../utils';

class TestableValDownloader extends ValDownloader {
    constructor(context: vscode.ExtensionContext,
        private shouldOverwriteDelegate: (toolName: string, yourConfiguredPath: string, newToolPath: string) => boolean) {
        
        super(context);
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    protected async downloadDelegate(_url: string, zipPath: string, _message: string): Promise<void> {
        const thisExtension = assertDefined(vscode.extensions.getExtension("jan-dolejsi.pddl"), `Extension 'jan-dolejsi.pddl' not found`);
        const extensionPath = thisExtension.extensionPath;
        const sourcePath = path.join(extensionPath, "src", "test", "val-drop-mock.zip");
        console.log(`Copying mock VAL drop from ${sourcePath} to ${zipPath}.`);
        return await fs.promises.copyFile(sourcePath, zipPath);
    }
    
    protected getLatestStableValBuildId(): number {
        return 37;
    }

    protected async shouldOverwrite(toolName: string, yourConfiguredPath: string, newToolPath: string): Promise<boolean> {
        return this.shouldOverwriteDelegate(toolName, yourConfiguredPath, newToolPath);
    }
}
 
suite('VAL Download and Configuration', () => {
    let origValStepPath: string | undefined;
    let origValConfiguration: string | undefined;
    let origValueSeqPath: string | undefined;
    let origParserPath: string | undefined;

    before(async () => {
        const thisExtension = assertDefined(vscode.extensions.getExtension("jan-dolejsi.pddl"), `Extension 'jan-dolejsi.pddl' not found`);
        if (!thisExtension.isActive) {
            await thisExtension.activate();
        }

        const pddlConf = vscode.workspace.getConfiguration(CONF_PDDL);
        // remember the setting
        origValStepPath = pddlConf.inspect<string>(VAL_STEP_PATH)?.globalValue;
        origValConfiguration = pddlConf.inspect<string>(VALIDATION_PATH)?.globalValue;
        origValueSeqPath = pddlConf.inspect<string>(VALUE_SEQ_PATH)?.globalValue;
        origParserPath = vscode.workspace.getConfiguration(PDDL_PARSER)
            .inspect<string>(PARSER_EXECUTABLE_OR_SERVICE)?.globalValue;
    });

    test('can configure ValStep', async () => {
        // GIVEN
        const conf = new PddlConfiguration(await createTestExtensionContext());
        const myValStepPath = 'MyValStep.exe';

        // WHEN
        const pddlConf = vscode.workspace.getConfiguration(CONF_PDDL);
        await pddlConf.update(VAL_STEP_PATH, myValStepPath, vscode.ConfigurationTarget.Global);

        const actualValStepPath = await conf.getValStepPath();

        // THEN
        expect(actualValStepPath).to.equal(myValStepPath);
    });
    
    test('does not overwrite custom ValStep configuration (legacy conf)', async () => { 
        const extensionContext = await createTestExtensionContext();
        const pddlConf = vscode.workspace.getConfiguration(CONF_PDDL);

        try {
            // GIVEN
            const valFolderPath = path.join(extensionContext.globalStoragePath, 'val');
            await utils.afs.mkdirIfDoesNotExist(valFolderPath, { mode: 0o777, recursive: true });
            const valManifestPath = path.join(valFolderPath, 'VAL.version');
            const previousValManifest = {
                "buildId": 24,
                "version": "20190805.2",
                "files": [
                    "Val-20190805.2-win64/bin/ValStep.exe",
                    "Val-20190805.2-win64/bin/PinguPlan.exe",
                    "Val-20190805.2-win64/bin/DomainView.exe",
                    "Val-20190805.2-win64/bin/Analyse.exe",
                    "Val-20190805.2-win64/bin/TIM.exe",
                    "Val-20190805.2-win64/bin/libwinpthread-1.dll",
                    "Val-20190805.2-win64/bin/libVAL.dll",
                    "Val-20190805.2-win64/bin/PlanRec.exe",
                    "Val-20190805.2-win64/bin/Relax.exe",
                    "Val-20190805.2-win64/bin/Validate.exe",
                    "Val-20190805.2-win64/bin/ToFn.exe",
                    "Val-20190805.2-win64/bin/HowWhatWhen.exe",
                    "Val-20190805.2-win64/bin/PlanSeqStep.exe",
                    "Val-20190805.2-win64/bin/libgcc_s_seh-1.dll",
                    "Val-20190805.2-win64/bin/PlanToValStep.exe",
                    "Val-20190805.2-win64/bin/Instantiate.exe",
                    "Val-20190805.2-win64/bin/Parser.exe",
                    "Val-20190805.2-win64/bin/ValueSeq.exe",
                    "Val-20190805.2-win64/bin/libstdc++-6.dll",
                    "Val-20190805.2-win64/bin/TypeAnalysis.exe",
                    "Val-20190805.2-win64/README.md"
                ],
                // "parserPath": "Val-20190805.2-win64/bin/Parser.exe",
                // "validatePath": "Val-20190805.2-win64/bin/Validate.exe",
                // "valueSeqPath": "Val-20190805.2-win64/bin/ValueSeq.exe",
                // "valStepPath": "Val-20190805.2-win64/bin/ValStep.exe"
            };
            await fs.promises.writeFile(valManifestPath, JSON.stringify(previousValManifest, null, 2));

            const myValStepPath = 'MyValStep.exe';
            await pddlConf.update(VAL_STEP_PATH, myValStepPath, vscode.ConfigurationTarget.Global);
            await pddlConf.update(VALIDATION_PATH, path.join('val', 'Val-20190805.2-win64', 'bin', 'Validate.exe'), vscode.ConfigurationTarget.Global);
            await pddlConf.update(VALUE_SEQ_PATH, path.join('val', 'Val-20190805.2-win64', 'bin', 'ValueSeq.exe'), vscode.ConfigurationTarget.Global);
            await vscode.workspace.getConfiguration(PDDL_PARSER)
                .update(EXECUTABLE_OR_SERVICE, path.join('val', 'Val-20190805.2-win64', 'bin', 'Parser.exe'), vscode.ConfigurationTarget.Global);

            const askedToOverwrite: string[] = [];

            const shouldOverwrite = function (toolName: string, yourConfiguredPath: string, newToolPath: string): boolean {
                console.log(`toolName: ${toolName}, yourConfiguredPath: ${yourConfiguredPath}, newToolPath: ${newToolPath}`);
                askedToOverwrite.push(toolName);
                return toolName !== 'ValStep';
            };
    
            // WHEN
            const valDownloader = new TestableValDownloader(extensionContext, shouldOverwrite);
            await valDownloader.downloadConfigureAndCleanUp();

            // THEN
            const conf = new PddlConfiguration(extensionContext);
            const actualValStepPath = await conf.getValStepPath();
            expect(actualValStepPath).to.equal(myValStepPath);
            const actualValueSeqPath = conf.getValueSeqPath();
            expect(actualValStepPath).to.not.be.undefined;
            assert.startsWith(actualValueSeqPath!, path.join(valFolderPath, 'Val-20190911.1-win64'), "value seq path");
            expect(askedToOverwrite).to.deep.equal(['ValStep']);
            
            const actualParserPath = conf.getParserPath();

            if (actualParserPath.includes(' ') && os.platform() === 'darwin') {
                expect(fs.existsSync(actualParserPath)).to.equal(true, `Parser at ${actualParserPath} should exist.`);
                expect(actualParserPath).to.include('\ ', "spaces should be escaped by backslash");
            }
        }
        finally {
            const allStoredFiles = await utils.afs.getFiles(extensionContext.globalStoragePath);
            console.log(`All files in the mocked global storage: \n` + allStoredFiles.join('\n'));
        }
    }).timeout(5000);

    after(async () => {
        // restore setting
        const pddlConf = vscode.workspace.getConfiguration(CONF_PDDL);
        await pddlConf.update(VAL_STEP_PATH, origValStepPath, vscode.ConfigurationTarget.Global);
        await pddlConf.update(VALIDATION_PATH, origValConfiguration, vscode.ConfigurationTarget.Global);
        await pddlConf.update(VALUE_SEQ_PATH, origValueSeqPath, vscode.ConfigurationTarget.Global);
        await vscode.workspace.getConfiguration(PDDL_PARSER)
            .update(EXECUTABLE_OR_SERVICE, origParserPath, vscode.ConfigurationTarget.Global);
    });
});