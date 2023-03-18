/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { URL } from 'url';
import { sleep } from '../utils';
import { HappeningType, HelpfulAction, search } from 'pddl-workspace';
import { DEFAULT_EPSILON } from '../configuration/configuration';
import { getText, postJson } from '../httpUtils';

export class MockSearch {
    url: string;
    constructor(port: number) {
        this.url = `http://localhost:${port}`;
    }

    async run(): Promise<void> { 
        const helloWorld = await getText(new URL(this.url + '/about'));

        console.log(helloWorld);

        for (const mockEvent of this.events) {
            console.log("sending mock event: ");
            console.log(mockEvent);
            await sleep(100);
            try {
                await this.send(mockEvent);
            }
            catch (ex) {
                console.log(ex);
                break;
            }
        }

        console.log('Mock-search finished.');
    }

    private async send(mockEvent: MockEvent): Promise<void> {
        switch (mockEvent.operation) {
            case 'post-initial':
                return await this.post('/state/initial', mockEvent.toWireMessage());
            case 'post':
                return await this.post('/state', mockEvent.toWireMessage());
            case 'patch':
                // this should really be a 'patch' verb, but the clients have more trouble making it work
                return await this.post('/state/heuristic', mockEvent.toWireMessage());
            default:
                console.log("Unsupported mock event: " + mockEvent.operation);
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private async post(path: string, content: any): Promise<void> {
        return await postJson(new URL(this.url + path), content);
    }

    /**
     * the `patch` method will be useful when the contract migrates `patch` HTTP verb.
     */
    // private async patch(path: string, content: any): Promise<void> {
    //     return await new Promise<void>((resolve, reject) => {
    //         request.patch(this.url + path, { json: content }, (error, httpResponse, _httpBody) => {
    //             if (error) {
    //                 reject(error);
    //             }
    //             else {
    //                 if (httpResponse && httpResponse.statusCode > 204) {
    //                     reject('HTTP status code ' + httpResponse.statusCode);
    //                 }
    //                 else {
    //                     resolve(void 0);
    //                 }
    //             }
    //         });
    //     });
    // }

    private state0: MockStateContext | undefined = undefined;
    private state0_0: MockStateContext | undefined = undefined;
    private state0_1: MockStateContext | undefined = undefined;
    private state0_0_0: MockStateContext | undefined = undefined;
    private state0_0_1: MockStateContext | undefined = undefined;
    private state0_1_0: MockStateContext | undefined = undefined;
    private state0_1_1: MockStateContext | undefined = undefined;
    private state0_1_0_0: MockStateContext | undefined = undefined;
    private state0_1_0_0_0: MockStateContext | undefined = undefined;

    private readonly events = [
        new MockStateContextEvent("post-initial", this.state0 = MockStateContext.createInitial()),
        new MockStateSearchContextEvent("patch", this.state0.evaluate(5,
            [MockHelpfulAction.start("drive"), MockHelpfulAction.start("load")],
            state => state.buildRelaxedPlan().start("drive").start("load").end(1, "load").end(3, "drive"))),
        new MockStateContextEvent("post", this.state0_0 = this.state0.applyStart("drive", 0)),
        new MockStateContextEvent("post", this.state0_1 = this.state0.applyStart("load", 0)),
        new MockStateSearchContextEvent("patch", this.state0_0.evaluate(5,
            [MockHelpfulAction.start("load"), MockHelpfulAction.end("drive")],
            state => state.buildRelaxedPlan().end(4, "drive").start("load").end(1, "load"))),
        new MockStateSearchContextEvent("patch", this.state0_1.evaluate(4,
            [MockHelpfulAction.start("drive"), MockHelpfulAction.end("load")],
            state => state.buildRelaxedPlan().end(1, "load").start("drive").end(4, "drive"))),

        new MockStateContextEvent("post", this.state0_0_0 = this.state0_0.applyEnd("drive", 0, 3)),
        new MockStateContextEvent("post", this.state0_0_1 = this.state0_0.applyStart("load", 0)),
        new MockStateSearchContextEvent("patch", this.state0_0_0.evaluate(4,
            [MockHelpfulAction.start("load")],
            state => state.buildRelaxedPlan().start("load").end(1, "load"))),
        new MockStateSearchContextEvent("patch", this.state0_0_1.evaluate(3,
            [MockHelpfulAction.end("load"), MockHelpfulAction.end("drive")],
            state => state.buildRelaxedPlan().end(4, "drive").end(1, "load"))),

        new MockStateContextEvent("post", this.state0_1_0 = this.state0_1.applyEnd("load", 0, .5)),
        new MockStateContextEvent("post", this.state0_1_1 = this.state0_1.applyStart("drive", 0)),
        new MockStateSearchContextEvent("patch", this.state0_1_0.evaluate(2,
            [MockHelpfulAction.start("drive")],
            state => state.buildRelaxedPlan().start("drive").end(4, "drive"))),
        new MockStateSearchContextEvent("patch", this.state0_1_1.evaluate(3,
            [MockHelpfulAction.end("drive"), MockHelpfulAction.end("load")],
            state => state.buildRelaxedPlan().end(4, "drive").end(1, "load"))),

        new MockStateContextEvent("post", this.state0_1_0_0 = this.state0_1_0.applyStart("drive", 0)),
        new MockStateSearchContextEvent("patch", this.state0_1_0_0.evaluate(1,
            [MockHelpfulAction.end("drive")],
            state => state.buildRelaxedPlan().end(4, "drive"))),

        new MockStateContextEvent("post", this.state0_1_0_0_0 = this.state0_1_0_0.applyEnd("drive", 0, 4)),
        new MockStateSearchContextEvent("patch", this.state0_1_0_0_0.evaluate(0, [], state => state.buildRelaxedPlan())),
    ];
}

abstract class MockEvent {
    constructor(public readonly operation: string) {

    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    abstract toWireMessage(): any;
}

class MockStateContextEvent extends MockEvent {
    constructor(readonly operation: string, public readonly stateContext: MockStateContext) {
        super(operation);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    toWireMessage(): any {
        return {
            id: this.stateContext.state.id,
            parentId: this.stateContext.parentId,
            g: this.stateContext.g,
            earliestTime: this.stateContext.earliestTime,
            appliedAction: this.stateContext.appliedAction ? toWireSearchHappening(this.stateContext.appliedAction) : null,
            planHead: this.stateContext.planHead.map(h => toWireSearchHappening(h))
        };
    }
}

class MockStateSearchContextEvent extends MockEvent {
    constructor(readonly operation: string, public readonly stateSearchContext: MockStateSearchContext) {
        super(operation);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    toWireMessage(): any {
        return {
            id: this.stateSearchContext.stateContext.state.id,
            totalMakespan: this.stateSearchContext.totalMakespan,
            h: this.stateSearchContext.h,
            helpfulActions: this.stateSearchContext.helpfulActions.map(a => toWireHelpfulAction(a)),
            relaxedPlan: this.stateSearchContext.relaxedPlan.map(h => toWireSearchHappening(h))
        };
    }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toWireSearchHappening(happening: search.SearchHappening): any {
    return {
        earliestTime: happening.earliestTime,
        actionName: happening.actionName,
        shotCounter: happening.shotCounter,
        kind: HappeningType[happening.kind]
    };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toWireHelpfulAction(action: HelpfulAction): any {
    return {
        actionName: action.actionName,
        kind: HappeningType[action.kind]
    };
}

class MockStateSearchContext {
    constructor(public readonly stateContext: MockStateContext, public readonly totalMakespan: number,
        public readonly h: number, public readonly helpfulActions: HelpfulAction[],
        public readonly relaxedPlan: search.SearchHappening[]) {

    }
}

class MockStateContext {

    static createInitial(): MockStateContext {
        return new MockStateContext(MockState.createInitial(), 0, EPSILON, undefined, [], undefined);
    }

    constructor(public readonly state: MockState, public readonly g: number, public readonly earliestTime: number,
        public readonly appliedAction: MockSearchHappening | undefined,
        public readonly planHead: search.SearchHappening[], public readonly parentId?: string) {
    }

    get actionName(): string | undefined{
        return this.appliedAction?.actionName;
    }

    isInitialState(): boolean {
        return this.planHead.length === 0;
    }

    getLastHappening(): search.SearchHappening {
        if (this.isInitialState()) {
            throw new Error("Check if this is an initial state first..");
        }
        return this.planHead[this.planHead.length - 1];
    }

    applyStart(actionName: string, shotCounter: number): MockStateContext {
        return this.apply(actionName, shotCounter, HappeningType.START, EPSILON);
    }

    applyEnd(actionName: string, shotCounter: number, duration: number): MockStateContext {
        return this.apply(actionName, shotCounter, HappeningType.END, duration);
    }

    apply(actionName: string, shotCounter: number, kind: HappeningType, timeIncrement: number): MockStateContext {
        const id = ++MockState.lastStateId;
        const earliestTime = this.earliestTime + timeIncrement;
        const appliedAction = new MockSearchHappening(earliestTime, actionName, shotCounter, 1, kind, false);
        const newPlanHead = this.planHead.concat([appliedAction]);
        return new MockStateContext(new MockState(id.toString()), this.g + 1, earliestTime, appliedAction, newPlanHead, this.state.id);
    }

    evaluate(h: number, helpfulActions: HelpfulAction[], relaxedPlanFactory: (stateContext: MockStateContext) => RelaxedPlanBuilder): MockStateSearchContext {
        const relaxedStateBuilder: RelaxedPlanBuilder = relaxedPlanFactory(this);
        const relaxedPlan = relaxedStateBuilder.build();
        const totalMakespan = relaxedPlan.length ? Math.max(...relaxedPlan.map(step => step.earliestTime)) : this.earliestTime;
        const newState = new MockStateSearchContext(this, totalMakespan, h, helpfulActions, relaxedPlan);

        return newState;
    }

    buildRelaxedPlan(): RelaxedPlanBuilder {
        return new RelaxedPlanBuilder(this.earliestTime);
    }

    toString(): string {
        return `State={id: ${this.state.id}, G: ${this.g}}`;
    }
}

class MockState {

    constructor(public readonly id: string) {
    }

    static createInitial(): MockState {
        const id = ++this.lastStateId;
        return new MockState(id.toString());
    }

    static lastStateId = -1;
}

const EPSILON = DEFAULT_EPSILON;

class RelaxedPlanBuilder {

    happenings: search.SearchHappening[] = [];
    time: number;

    constructor(private readonly earliestStateTime: number) {
        this.time = this.earliestStateTime;
    }

    start(actionName: string): RelaxedPlanBuilder {
        const time = this.time += EPSILON;
        this.happenings.push(new MockSearchHappening(time, actionName, 0, 1, HappeningType.START, true));
        return this;
    }

    end(timeOffset: number, actionName: string): RelaxedPlanBuilder {
        const time = this.time += timeOffset;
        this.happenings.push(new MockSearchHappening(time, actionName, 0, 1, HappeningType.END, true));
        return this;
    }

    build(): search.SearchHappening[] {
        return this.happenings;
    }
}


class MockSearchHappening implements search.SearchHappening{
    constructor(public readonly earliestTime: number, public readonly actionName: string,
        public readonly shotCounter: number, public readonly iterations: number,
        public readonly kind: HappeningType, public readonly isRelaxed: boolean) { }

    toString(): string {
        const relaxed = this.isRelaxed ? '*' : '';
        const iterations = this.iterations > 1 ? ` ${this.iterations}x` : '';
        return `${this.earliestTime}: ${this.actionName}[${this.shotCounter}] ${this.kind}${relaxed}${iterations}`;
    }
}

class MockHelpfulAction implements HelpfulAction {
    constructor(public readonly actionName: string, public readonly kind: HappeningType) { }

    static start(actionName: string): MockHelpfulAction {
        return new MockHelpfulAction(actionName, HappeningType.START);
    }

    static end(actionName: string): MockHelpfulAction {
        return new MockHelpfulAction(actionName, HappeningType.END);
    }
}
