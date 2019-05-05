/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import request = require('request');
import { sleep } from '../utils';
import { SearchHappening, MockSearchHappening, MockHelpfulAction } from './SearchHappening';
import { HappeningType } from "../../../common/src/HappeningsInfo";
import { HelpfulAction } from "../../../common/src/Plan";

export class MockSearch {
    url: string;
    constructor(port: number) {
        this.url = `http://localhost:${port}`;
    }

    async run(): Promise<void> {
        let helloWorld = await new Promise<string>((resolve, reject) => {
            request.get(this.url + '/about', (error, httpResponse, httpBody) => {
                if (error) {
                    reject(error)
                }
                else {
                    if (httpResponse && httpResponse.statusCode > 204) {
                        reject("HTTP status code " + httpResponse.statusCode);
                    }
                    else {
                        resolve(httpBody);
                    }
                }
            });
        });

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
                break;
            case 'patch':
                // this should really be a 'patch' verb, but the clients have more trouble making it work
                return await this.post('/state/heuristic', mockEvent.toWireMessage());
                break;
            default:
                console.log("Unsupported mock event: " + mockEvent.operation);
        }
    }

    private async post(path: string, content: any): Promise<void> {
        return await new Promise<void>((resolve, reject) => {
            request.post(this.url + path, { json: content }, (error, httpResponse, _httpBody) => {
                if (error) {
                    reject(error);
                }
                else {
                    if (httpResponse && httpResponse.statusCode > 204) {
                        reject('HTTP status code ' + httpResponse.statusCode);
                    }
                    else {
                        resolve(void 0);
                    }
                }
            });
        });
    }

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

    private state0: MockStateContext;
    private state0_0: MockStateContext;
    private state0_1: MockStateContext;
    private state0_0_0: MockStateContext;
    private state0_0_1: MockStateContext;
    private state0_1_0: MockStateContext;
    private state0_1_1: MockStateContext;
    private state0_1_0_0: MockStateContext;
    private state0_1_0_0_0: MockStateContext;

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

    abstract toWireMessage(): any;
}

class MockStateContextEvent extends MockEvent {
    constructor(readonly operation: string, public readonly stateContext: MockStateContext) {
        super(operation);
    }

    toWireMessage(): any {
        return {
            id: this.stateContext.state.id,
            parentId: this.stateContext.parentId,
            g: this.stateContext.g,
            earliestTime: this.stateContext.earliestTime,
            planHead: this.stateContext.planHead.map(h => toWireSearchHappening(h))
        };
    }
}

class MockStateSearchContextEvent extends MockEvent {
    constructor(readonly operation: string, public readonly stateSearchContext: MockStateSearchContext) {
        super(operation);
    }

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

function toWireSearchHappening(happening: SearchHappening): any {
    return {
        earliestTime: happening.earliestTime,
        actionName: happening.actionName,
        shotCounter: happening.shotCounter,
        kind: HappeningType[happening.kind]
    };
}

function toWireHelpfulAction(action: HelpfulAction): any {
    return {
        actionName: action.actionName,
        kind: HappeningType[action.kind]
    }
}

class MockStateSearchContext {
    constructor(public readonly stateContext: MockStateContext, public readonly totalMakespan: number,
        public readonly h: number, public readonly helpfulActions: HelpfulAction[],
        public readonly relaxedPlan: SearchHappening[]) {

    }
}

class MockStateContext {

    static createInitial(): MockStateContext {
        return new MockStateContext(MockState.createInitial(), 0, EPSILON, [], null);
    }

    private _actionName: string;

    constructor(public readonly state: MockState, public readonly g: number, public readonly earliestTime: number,
        public readonly planHead: SearchHappening[], public readonly parentId?: string) {
        this._actionName = !this.isInitialState() ?
            this.getLastHappening().actionName :
            null;
    }

    get actionName(): string {
        return this._actionName;
    }

    isInitialState(): boolean {
        return this.planHead.length == 0;
    }

    getLastHappening(): SearchHappening {
        if (this.isInitialState()) throw new Error("Check if this is an initial state first..");
        return this.planHead[this.planHead.length - 1];
    }

    applyStart(actionName: string, shotCounter: number): MockStateContext {
        return this.apply(actionName, shotCounter, HappeningType.START, EPSILON);
    }

    applyEnd(actionName: string, shotCounter: number, duration: number): MockStateContext {
        return this.apply(actionName, shotCounter, HappeningType.END, duration);
    }

    apply(actionName: string, shotCounter: number, kind: HappeningType, timeIncrement: number): MockStateContext {
        let id = ++MockState.lastStateId;
        let earliestTime = this.earliestTime + timeIncrement;
        let newPlanHead = this.planHead.concat([new MockSearchHappening(earliestTime, actionName, shotCounter, kind, false)]);
        return new MockStateContext(new MockState(id.toString()), this.g + 1, earliestTime, newPlanHead, this.state.id);
    }

    evaluate(h: number, helpfulActions: HelpfulAction[], relaxedPlanFactory: (stateContext: MockStateContext) => RelaxedPlanBuilder): MockStateSearchContext {
        let relaxedStateBuilder: RelaxedPlanBuilder = relaxedPlanFactory(this);
        let relaxedPlan = relaxedStateBuilder.build();
        let totalMakespan = relaxedPlan.length ? Math.max(...relaxedPlan.map(step => step.earliestTime)) : this.earliestTime;
        var newState = new MockStateSearchContext(this, totalMakespan, h, helpfulActions, relaxedPlan);

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
        var id = ++this.lastStateId;
        return new MockState(id.toString());
    }

    static lastStateId = -1;
}

const EPSILON = 1e-3;

class RelaxedPlanBuilder {

    happenings: SearchHappening[] = [];
    time: number;

    constructor(private readonly earliestStateTime: number) {
        this.time = this.earliestStateTime;
    }

    start(actionName: string): RelaxedPlanBuilder {
        let time = this.time += EPSILON;
        this.happenings.push(new MockSearchHappening(time, actionName, 0, HappeningType.START, true));
        return this;
    }

    end(timeOffset: number, actionName: string): RelaxedPlanBuilder {
        let time = this.time += timeOffset;
        this.happenings.push(new MockSearchHappening(time, actionName, 0, HappeningType.END, true));
        return this;
    }

    build(): SearchHappening[] {
        return this.happenings;
    }
}