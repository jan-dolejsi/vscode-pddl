import * as path from 'path';

import { runTests } from 'vscode-test';
import { URI } from 'vscode-uri';
import { utils } from 'pddl-workspace';
import { TestOptions } from 'vscode-test/out/runTest';

async function main(): Promise<void> {
	try {
		// The folder containing the Extension Manifest package.json
		// Passed to `--extensionDevelopmentPath`
		const extensionDevelopmentPath = path.resolve(__dirname, '../../');

		// The path to the extension test script
		// Passed to --extensionTestsPath
		const extensionTestsPath = path.resolve(__dirname, './suite/index');

		const vsCodeVersions = ['stable']; //'1.44.1', 

		const options: TestOptions = {
			extensionDevelopmentPath: extensionDevelopmentPath, extensionTestsPath: extensionTestsPath
		};

		for (const version of vsCodeVersions) {
			await runTestsInEmptyWorkspaceFolder(options, version, ["--disable-extensions"]);
		}

	} catch (err) {
		console.error('Failed to run tests');
		process.exit(1);
	}
}

async function runTestsInEmptyWorkspaceFolder(options: TestOptions, version: string, launchArgs: string[]): Promise<number> {

	options.version = version;

	// Create temp folder for the workspace
	const workspaceFolderName = `pddl-test-workspace-folder_${version}_`;
	console.log(`Creating temp workspace folder: ${workspaceFolderName}`);
	const workspaceFolderPath = await utils.atmp.dir(0x644, workspaceFolderName);

	// Create temp folder for the workspace
	const userProfileFolderName = `vscode-user-settings_${version}_`;
	console.log(`Creating temp user profile folder: ${userProfileFolderName}`);
	const userDataDirPath = await utils.atmp.dir(0x644, userProfileFolderName);
	console.log(`Creating the 'User' sub-folder`);
	await utils.afs.mkdirIfDoesNotExist(path.join(userDataDirPath, 'User'), { mode: 0x644, recursive: true });

	options.launchArgs = launchArgs.concat([
		// The path to the workspace, where the files will be created
		"--folder-uri=" + URI.file(workspaceFolderPath),
		// user settings
		"--user-data-dir=" + userDataDirPath
	]);

	console.log(`Calling vscode-test ${version} with arguments: `);
	console.dir(options);

	// Download given VS Code version, unzip it and run the integration test
	return await runTests(options);
}


main();
