require('dotenv').config();
const fs = require('fs');
const stripAnsi = require('strip-ansi');
const RPClient = require('reportportal-js-client');

const baseUrl = process.env.REPORT_PORTAL_BASE_URL + '/api/v1';

export default class ProductReport {

    constructor() {
        this.projectName = process.env.REPORT_PORTAL_PROJECT_NAME;
        this.launchName = process.env.REPORT_PORTAL_LAUNCH_NAME || this.projectName;
        this.description = typeof process.env.REPORT_PORTAL_DESCRIPTION === 'undefined' ? void 0 : process.env.REPORT_PORTAL_DESCRIPTION;
        this.tagsList = typeof process.env.REPORT_PORTAL_TAGS === 'undefined' ? void 0 : process.env.REPORT_PORTAL_TAGS.split(',');
        this.fixtureList = [];
        this.connected = true;

        this.rpClient = new RPClient({
            token : process.env.REPORT_PORTAL_TOKEN,
            endpoint : baseUrl,
            launch : this.launchName,
            project : this.projectName,
            debug: true
        });

        this.rpClient.checkConnect().then((response) => {
            this.connected = true;
            console.log('You have successfully connected to the server.');
            // console.log(`You are using an account: ${response.full_name}`);
        }, (error) => {
            console.warn('Error connecting to ReportPortal, confirm that your details are correct.');
            console.dir(error);
            this.connected = false;
        });
    }

    startLaunch() {
        if (!this.connected) return 'Unknown Launch ID';
        const launchObj = this.rpClient.startLaunch({
            name: this.launchName,
            description: this.description,
            tags: this.tagsList,
            startTime: this.rpClient.helpers.now()
        });

        // To know the real launch id wait for the method to finish. The real id is used by the client in asynchronous reporting.
        // launchObj.promise.then((response) => {
        //     console.log(`Launch real id: ${response.id}`);
        // }, (error) => {
        //     console.dir(`Error at the start of launch: ${error}`);
        // })

        return launchObj.tempId;
    }

    captureFixtureItem(launchId, fixtureName) {
        if (!this.connected) return 'Unknown Test ID';
        const suiteObj = this.rpClient.startTestItem({
            name: fixtureName,
            type: 'SUITE',
            startTime: this.rpClient.helpers.now()
        }, launchId);

        this.fixtureList.push(suiteObj.tempId);
        return suiteObj.tempId;
    }

    captureTestItem(launchId, fixtureId, stepName, status, testRunInfo, parentSelf) {
        if (!this.connected) return;

        var start_time = this.rpClient.helpers.now();
        const stepObj = this.rpClient.startTestItem({
            name: stepName,
            startTime: start_time,
            type: 'STEP'
        }, launchId, fixtureId);

        if (testRunInfo.screenshots) {
            testRunInfo.screenshots.forEach((screenshot, idx) => {
                // console.log('screenshotPath -> ', screenshot.screenshotPath);

                const screenshotContent = fs.readFileSync(screenshot.screenshotPath);

                this.rpClient.sendLog(stepObj.tempId,
                    {
                        status: 'error',
                        message: 'Error Screenshot',
                        time: start_time
                    },
                    {
                        name: `${stepName}.png`,
                        type: 'image/png',
                        content: screenshotContent
                    }
                );
            });
        }

        if (testRunInfo.errs) {
            testRunInfo.errs.forEach((err, idx) => {
                err = parentSelf.formatError(err);

                this.rpClient.sendLog(stepObj.tempId, {
                    status: 'error',
                    message: stripAnsi(err),
                    time: start_time
                });
            });
        }

        var testResult = {
            status: status,
            endTime: start_time + testRunInfo.durationMs
        };

        if (status === 'skipped') testResult.issue = { issue_type: 'NOT_ISSUE' };

        this.rpClient.finishTestItem(stepObj.tempId, testResult);
        console.log('finishTestItme');
    }

    async finishFixture() {
        if (!this.connected) return;
        this.fixtureList.forEach((id) => {
            this.rpClient.finishTestItem(id, {
                endTime: this.rpClient.helpers.now()
            });
        });
        //await new Promise(resolve => setTimeout(resolve, 10000));
        //console.log('finishFixture: end');
    }

    async finishLaunch(launchId) {
        //console.log('finishLaunch: start');
        if (!this.connected) return;
        await this.finishFixture();
        const f = this.rpClient.finishLaunch(launchId, {
            end_time: this.rpClient.helpers.now()
        });
        await f.promise.then(() => {
            console.log('all finished');
        }, () => {
            console.log('then2');
        });
        console.log('finishLaunch: end');
    }

}
