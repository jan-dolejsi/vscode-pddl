import * as path from 'path';

import { runTests } from 'vscode-test';
import { URI } from 'vscode-uri';
import { utils } from 'pddl-workspace';
import * as tmp from 'tmp-promise';
import { TestOptions } from 'vscode-test/out/runTest';

async function main(): Promise<void> {
	try {
		// The folder containing the Extension Manifest package.json
		// Passed to `--extensionDevelopmentPath`
		const extensionDevelopmentPath = path.resolve(__dirname, '../../');

		// The path to test runner
		// Passed to --extensionTestsPath
		const extensionTestsPath = path.resolve(__dirname, './suite/index');

		const vsCodeVersions = ['stable']; //'1.50.x', 

		const options: TestOptions = {
			extensionDevelopmentPath: extensionDevelopmentPath, extensionTestsPath: extensionTestsPath
		};

		for (const version of vsCodeVersions) {
			await runTestsInEmptyWorkspaceFolder(options, version, ["--disable-extensions"]);
		}

	} catch (err: unknown) {
		const error = err as Error;
		console.error('Failed to run tests:'  + (error.message ?? err));
		process.exit(1);
	}
}

async function runTestsInEmptyWorkspaceFolder(options: TestOptions, version: string, launchArgs: string[]): Promise<number> {

	options.version = version;

	// Create temp folder for the workspace
	const workspaceFolderName = `pddl-test-workspace-folder_${version}_`;
	console.log(`Creating temp workspace folder: ${workspaceFolderName}`);
	const workspaceFolder = await tmp.dir({ prefix: workspaceFolderName });

	// Create temp folder for the user
	const userProfileFolderName = `vscode-user-settings_${version}_`;
	console.log(`Creating temp user profile folder: ${userProfileFolderName}`);
	const userDataDir = await tmp.dir({ prefix: userProfileFolderName } );
	console.log(`Creating the 'User' sub-folder: ${path.join(userDataDir.path, 'User')}`);
	await utils.afs.mkdirIfDoesNotExist(path.join(userDataDir.path, 'User'), { recursive: true });
	console.log(`Created 'User' sub-folder`);

	options.launchArgs = launchArgs.concat([
		// The path to the workspace, where the files will be created
		"--folder-uri=" + URI.file(workspaceFolder.path),
		// user settings
		"--user-data-dir=" + userDataDir.path
	]);

	console.log(`Calling vscode-test ${version} with arguments: `);
	console.dir(options);

	// Download given VS Code version, unzip it and run the integration test
	return await runTests(options);
}


main();
