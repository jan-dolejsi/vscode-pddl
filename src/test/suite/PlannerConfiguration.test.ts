/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi 2020. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { window, workspace, ConfigurationTarget } from 'vscode';
import { before, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import { MockPlannerProvider, activateExtension, clearWorkspaceFolder, clearConfiguration } from './testUtils';
import { assertDefined } from '../../utils';
import { plannersConfiguration, codePddlWorkspaceForTests } from '../../extension';
import { PlannerConfigurationScope, CONF_PLANNERS, CONF_SELECTED_PLANNER } from '../../configuration/PlannersConfiguration';
import { PDDL_PLANNER, EXECUTABLE_OR_SERVICE, EXECUTABLE_OPTIONS, CONF_PDDL } from '../../configuration/configuration';
import { fail } from 'assert';

suite('Planner configuration test', () => {

	before(async () => {
		await activateExtension();
		window.showInformationMessage('Start Planner Configuration tests.');
	});

	beforeEach(async () => {
		await clearWorkspaceFolder();
		await clearConfiguration();
	});

	afterEach(async () => {
		await clearConfiguration();
	});

	test('Default planners are returned in blank configuration', () => {
		const wf = assertDefined(workspace.workspaceFolders, "workspace folders")[0];

		// WHEN
		const planners = plannersConfiguration.getPlanners(wf);

		// THEN
		expect(planners).to.have.lengthOf(1);
		const defaultPlanner = planners[0];
		expect(defaultPlanner).to.not.be.undefined;
		expect(defaultPlanner.scope).to.equal(PlannerConfigurationScope.Default);
		expect(defaultPlanner.configuration.url).to.equal('http://solver.planning.domains/solve');
	});

	test('Creates a user-level planner', async () => {
		const wf = assertDefined(workspace.workspaceFolders, "workspace folders")[0];

		// GIVEN the mock planner is configured

		const mockConfiguration = await new MockPlannerProvider().configurePlanner();
		await plannersConfiguration.addPlannerConfiguration(PlannerConfigurationScope.User, mockConfiguration);

		// WHEN
		const planners = plannersConfiguration.getPlanners(wf);
		const selectedPlanner = plannersConfiguration.getSelectedPlanner(wf);

		// THEN
		expect(planners).to.have.lengthOf(2);
		const userPlanners = planners.filter(spc => spc.scope === PlannerConfigurationScope.User);
		expect(userPlanners).to.have.lengthOf(1);
		const createdPlanner = userPlanners[0];
		expect(createdPlanner).to.not.be.undefined;
		expect(createdPlanner.scope).to.equal(PlannerConfigurationScope.User);
		expect(createdPlanner.configuration.path).to.not.be.undefined;
		expect(createdPlanner.configuration.path).to.startWith('node');
		expect(selectedPlanner).to.not.be.undefined;
		expect(selectedPlanner).to.deep.equal(createdPlanner);
		expect(selectedPlanner?.index).to.equal(0);
		expect(selectedPlanner?.workspaceFolder).to.be.undefined;
	});

	test('Crates a workspace folder planner', async () => {
		const wf = assertDefined(workspace.workspaceFolders, "workspace folders")[0];

		{
			const plannersInspect = workspace.getConfiguration(CONF_PDDL, wf).inspect(CONF_PLANNERS);
			expect(plannersInspect?.globalValue).to.be.undefined;
			expect(plannersInspect?.workspaceValue).to.be.undefined;
			expect(plannersInspect?.workspaceFolderValue).to.be.undefined;
		}

		// GIVEN the mock planner is configured

		const mockConfiguration = await new MockPlannerProvider().configurePlanner();
		await plannersConfiguration.addPlannerConfiguration(PlannerConfigurationScope.WorkspaceFolder, mockConfiguration, wf);

		// WHEN
		const allPlanners = plannersConfiguration.getPlanners(wf);
		const workspaceFolderPlanners = plannersConfiguration.getPlannersPerScope(PlannerConfigurationScope.WorkspaceFolder, wf);
		const selectedPlanner = plannersConfiguration.getSelectedPlanner(wf);

		// THEN
		expect(workspaceFolderPlanners).to.have.lengthOf(1);
		expect(allPlanners).to.have.lengthOf(2);
		const createdPlanner = allPlanners[0];
		expect(createdPlanner).to.not.be.undefined;
		expect(createdPlanner.scope).to.equal(PlannerConfigurationScope.WorkspaceFolder);
		expect(createdPlanner.configuration.path).to.not.be.undefined;
		expect(createdPlanner.configuration.path).to.startWith('node');
		expect(selectedPlanner).to.not.be.undefined;
		expect(selectedPlanner).to.deep.equal(createdPlanner);
		expect(selectedPlanner?.index).to.equal(0);
		expect(selectedPlanner?.workspaceFolder).to.equal(wf.uri.toString());
	});

	test('When identical planner is created again, title should be made unique', async () => {
		// const wf = assertDefined(workspace.workspaceFolders, "workspace folders")[0];

		// GIVEN the mock planner is configured

		const plannerConfig1 = await plannersConfiguration.addPlannerConfiguration(PlannerConfigurationScope.User,
			await new MockPlannerProvider().configurePlanner());

		// WHEN (the second intentionally identical configuration is created)
		const plannerConfig2 = await plannersConfiguration.addPlannerConfiguration(PlannerConfigurationScope.User,
			await new MockPlannerProvider().configurePlanner());
		const plannerConfig3 = await plannersConfiguration.addPlannerConfiguration(PlannerConfigurationScope.User,
			await new MockPlannerProvider().configurePlanner());

		// THEN
		expect(plannerConfig1).to.not.be.undefined;
		expect(plannerConfig2).to.not.be.undefined;
		expect(plannerConfig3).to.not.be.undefined;
		expect(plannerConfig2.configuration.title, "second config should differ from first").to.not.equal(plannerConfig1.configuration.title);
		expect(plannerConfig2.configuration.title).to.endWith("#2");
		expect(plannerConfig3.configuration.title).to.endWith("#3");
	});

	test('Selecting global/user-level planner clears selection on workspace folder', async () => {
		const wf = assertDefined(workspace.workspaceFolders, "workspace folders")[0];

		// GIVEN the mock planner is configured

		const globalPlannerConfig = await plannersConfiguration.addPlannerConfiguration(PlannerConfigurationScope.User,
			await new MockPlannerProvider().configurePlanner());
		const folderPlannerConfig = await plannersConfiguration.addPlannerConfiguration(PlannerConfigurationScope.WorkspaceFolder,
			await new MockPlannerProvider().configurePlanner(), wf);
		{
			const selectedPlanner = plannersConfiguration.getSelectedPlanner(wf);
			expect(selectedPlanner, "after the folder planner is created, it shall be selected").to.deep.equal(folderPlannerConfig);
		}

		// WHEN
		await plannersConfiguration.setSelectedPlanner(globalPlannerConfig);

		// THEN
		const selectedPlanner = plannersConfiguration.getSelectedPlanner(wf);
		expect(selectedPlanner, "after the global planner is selected, it should be ... selected").to.deep.equal(globalPlannerConfig);
		const selectedPlannerInspect = workspace.getConfiguration(CONF_PDDL, wf).inspect<string>(CONF_SELECTED_PLANNER);
		expect(selectedPlannerInspect?.globalValue).to.equal(globalPlannerConfig.configuration.title);
		expect(selectedPlannerInspect?.workspaceFolderValue).to.be.undefined;
	});

	test('Selecting planner in a scope is saved to the given scope', async () => {
		const wf = assertDefined(workspace.workspaceFolders, "workspace folders")[0];

		// GIVEN the mock planner is configured

		const folderPlannerConfig = await plannersConfiguration.addPlannerConfiguration(
			PlannerConfigurationScope.WorkspaceFolder,
			await new MockPlannerProvider().configurePlanner(), wf);
		const globalPlannerConfig = await plannersConfiguration.addPlannerConfiguration(
			PlannerConfigurationScope.User,
			await new MockPlannerProvider().configurePlanner());
		
		{
			const selectedPlanner = plannersConfiguration.getSelectedPlanner(wf);
			expect(selectedPlanner, "after the folder planner is created, it shall be selected").to.deep.equal(globalPlannerConfig);
		}

		// WHEN
		await plannersConfiguration.setSelectedPlanner(folderPlannerConfig);

		// THEN
		const selectedPlanner = plannersConfiguration.getSelectedPlanner(wf);
		expect(selectedPlanner, "after the folder planner is selected, it should be ... selected").to.deep.equal(folderPlannerConfig);

		const selectedPlannerInspect = workspace.getConfiguration(CONF_PDDL, wf).inspect(CONF_SELECTED_PLANNER);
		expect(selectedPlannerInspect?.globalValue).to.equal(globalPlannerConfig.configuration.title);
		expect(selectedPlannerInspect?.workspaceFolderValue).to.equal(folderPlannerConfig.configuration.title);
	});

	test('Re-configures planner', async () => {
		const wf = assertDefined(workspace.workspaceFolders, "workspace folders")[0];
		const plannerProvider = new MockPlannerProvider({ canConfigure: true });

		// GIVEN the mock planner is configured
		codePddlWorkspaceForTests?.pddlWorkspace.getPlannerRegistrar().registerPlannerProvider(plannerProvider.kind, plannerProvider);
		const mockConfiguration = await plannerProvider.configurePlanner();
		const scopedMockConfiguration = await plannersConfiguration.addPlannerConfiguration(PlannerConfigurationScope.WorkspaceFolder, mockConfiguration, wf);

		// WHEN
		const preSelectedPlanner = plannersConfiguration.getSelectedPlanner(wf);
		expect(preSelectedPlanner).to.deep.equal(scopedMockConfiguration);
		expect(preSelectedPlanner).to.not.be.undefined;
		if (!preSelectedPlanner) { fail(); }
		// modify the mock provider
		plannerProvider.setExpectedPath('java -jar asdf.jar');
		const updatedConfiguration = await plannersConfiguration.configureAndSavePlanner(preSelectedPlanner);
		expect(updatedConfiguration).to.not.be.undefined;

		// THEN
		const allPlanners = plannersConfiguration.getPlanners(wf);
		const workspaceFolderPlanners = plannersConfiguration.getPlannersPerScope(PlannerConfigurationScope.WorkspaceFolder, wf);
		const postSelectedPlanner = plannersConfiguration.getSelectedPlanner(wf);

		expect(workspaceFolderPlanners).to.have.lengthOf(1);
		expect(allPlanners).to.have.lengthOf(2);
		const actualUpdatedPlanner = workspaceFolderPlanners[0];
		expect(actualUpdatedPlanner).to.not.be.undefined;
		expect(actualUpdatedPlanner.path).to.not.be.undefined;
		expect(actualUpdatedPlanner.path).to.startWith('java');
		expect(postSelectedPlanner).to.not.be.undefined;
		expect(postSelectedPlanner).to.deep.equal(updatedConfiguration);
		expect(postSelectedPlanner?.configuration).to.deep.equal(actualUpdatedPlanner);
		expect(postSelectedPlanner?.index).to.equal(0);
	});

	test('Deletes user-level planner', async () => {
		const wf = assertDefined(workspace.workspaceFolders, "workspace folders")[0];
		const countBefore = plannersConfiguration.getPlanners(wf).length;

		// GIVEN the mock planner is configured

		const mockConfiguration = await new MockPlannerProvider().configurePlanner();
		const scopedMockConfiguration = await plannersConfiguration.addPlannerConfiguration(PlannerConfigurationScope.User, mockConfiguration);

		const countBeforeDeletion = plannersConfiguration.getPlanners(wf).length;

		// WHEN
		await plannersConfiguration.deletePlanner(scopedMockConfiguration);

		// THEN
		const countAfter = plannersConfiguration.getPlanners(wf).length;
		expect(countBeforeDeletion).to.equal(countBefore + 1);
		expect(countAfter).to.equal(countBefore);
	});

	test('Deletes folder-level planner', async () => {
		const wf = assertDefined(workspace.workspaceFolders, "workspace folders")[0];
		const countBefore = plannersConfiguration.getPlanners(wf).length;

		// GIVEN the mock planner is configured

		const mockConfiguration = await new MockPlannerProvider().configurePlanner();
		const scopedMockConfiguration = await plannersConfiguration.addPlannerConfiguration(PlannerConfigurationScope.WorkspaceFolder, mockConfiguration, wf);

		const countBeforeDeletion = plannersConfiguration.getPlanners(wf).length;

		// WHEN
		await plannersConfiguration.deletePlanner(scopedMockConfiguration);

		// THEN
		const countAfter = plannersConfiguration.getPlanners(wf).length;
		expect(countBeforeDeletion).to.equal(countBefore + 1);
		expect(countAfter).to.equal(countBefore);
	});

	test('Migrates global deprecated planner executable configuration', async () => {
		const executable = 'planner.exe';
		const syntax = 'planner_syntax';

		// GIVEN
		await workspace.getConfiguration(PDDL_PLANNER).update(EXECUTABLE_OR_SERVICE, executable, ConfigurationTarget.Global);
		await workspace.getConfiguration(PDDL_PLANNER).update(EXECUTABLE_OPTIONS, syntax, ConfigurationTarget.Global);

		// WHEN
		await plannersConfiguration.migrateLegacyConfiguration();

		// THEN
		const legacyPlanner = workspace.getConfiguration(PDDL_PLANNER).get(EXECUTABLE_OR_SERVICE);
		expect(legacyPlanner, "migrated legacy executable should be removed").to.equal('');
		expect(workspace.getConfiguration(PDDL_PLANNER).get(EXECUTABLE_OPTIONS)).to.equal('', "migrated legacy executable syntax should be removed");
		const migratedPlanners = plannersConfiguration.getPlanners();
		expect(migratedPlanners).to.have.lengthOf(2);
		const migratedPlanner = migratedPlanners[0];
		expect(migratedPlanner).to.not.be.undefined;
		expect(migratedPlanner.scope).to.equal(PlannerConfigurationScope.User);
		expect(migratedPlanner.configuration.path).to.equal(executable);
		expect(migratedPlanner.configuration.syntax).to.equal(syntax);
		expect(migratedPlanner.configuration.title).to.equal(executable);
	});

	test('Migrates deprecated planner service configuration', async () => {
		const executable = 'http://solver.planning.domains/solve';

		// GIVEN
		await workspace.getConfiguration(PDDL_PLANNER).update(EXECUTABLE_OR_SERVICE, executable, ConfigurationTarget.Global);

		// WHEN
		await plannersConfiguration.migrateLegacyConfiguration();

		// THEN
		expect(workspace.getConfiguration(PDDL_PLANNER).get(EXECUTABLE_OR_SERVICE)).to.equal('', "migrated legacy executable should be removed");
		expect(workspace.getConfiguration(PDDL_PLANNER).get(EXECUTABLE_OPTIONS)).to.equal('', "migrated legacy executable syntax should be removed");
		const migratedPlanners = plannersConfiguration.getPlanners();
		expect(migratedPlanners).to.have.lengthOf(2);
		const migratedPlanner = migratedPlanners[0];
		expect(migratedPlanner).to.not.be.undefined;
		expect(migratedPlanner.scope).to.equal(PlannerConfigurationScope.User);
		expect(migratedPlanner.configuration.url).to.equal(executable);
		expect(migratedPlanner.configuration.title).to.equal(executable + ' #2');
	});


	test('Migrates deprecated workspace folder planner service configuration', async () => {
		const wf = assertDefined(workspace.workspaceFolders, "workspace folders")[0];
		const executable = 'http://localhost:8080/request';

		// GIVEN
		await workspace.getConfiguration(PDDL_PLANNER, wf).update(EXECUTABLE_OR_SERVICE, executable);

		// WHEN
		await plannersConfiguration.migrateLegacyConfiguration();

		// THEN
		expect(workspace.getConfiguration(PDDL_PLANNER, wf).get(EXECUTABLE_OR_SERVICE)).to.equal('', "migrated legacy executable should be removed");
		expect(workspace.getConfiguration(PDDL_PLANNER, wf).get(EXECUTABLE_OPTIONS)).to.equal('', "migrated legacy executable syntax should be removed");
		const migratedPlanners = plannersConfiguration.getPlannersPerScope(PlannerConfigurationScope.WorkspaceFolder, wf);
		expect(migratedPlanners).to.have.lengthOf(1);
		const migratedPlanner = migratedPlanners[0];
		expect(migratedPlanner).to.not.be.undefined;
		expect(migratedPlanner.url).to.equal(executable);
		expect(migratedPlanner.title).to.equal(executable);
	});
});
