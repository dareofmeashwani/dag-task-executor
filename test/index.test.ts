import { Executor } from '../lib/index'
describe("Executor", () => {
  let taskId = -1;
  const generateTask = function (
    identifier = "id",
    isFail = false,
    time = 0,
    returnType = "promise",
    taskValidation = true
  ) {
    ++taskId;
    const successResponse = `Task Id ${taskId} SUCCESS`;
    const failResponse = `Task Id ${taskId} FAILED`;
    return {
      [identifier]: taskId + "",
      description: `Description for task id ${taskId}`,
      execute: async () => {
        if (returnType === "promise") {
          return new Promise((resolve, reject) => {
            setTimeout(() => (isFail ? reject(failResponse) : resolve(successResponse)), time);
          });
        }
        return successResponse;
      },
      isRequired: async function () {
        return Promise.resolve({ isRequired: taskValidation, });
      },
      getNumberOfRetries: function () {
        return 0;
      },
      getRetryDelay: function () {
        return 0;
      },
    };
  };
  const generateAdapter = function () {
    return {
      sequence: [],
      allCallData: [],
      getPayload: function (task: any, allTaskResponseData: any) {
        this.sequence.push((task.name || task.id) as string);
        this.allCallData.push(allTaskResponseData);
      },
    } as { sequence: any[], allCallData: any[] };
  };
  describe("executeAndWait", () => {
    it("executeAndWait: Should execute below sequence successfully", async function () {
      /*
                      0-> 1 -> 2 -> 3 -> 4
                  */
      taskId = -1;
      const tasks: any[] = [
        generateTask("name", false, Math.random() * 5),
        generateTask("name", false, Math.random() * 5),
        generateTask("name", false, Math.random() * 5),
        generateTask("name", false, Math.random() * 5),
        generateTask("name", false, Math.random() * 5)
      ];
      tasks[1].dependsOn = [tasks[0]];
      tasks[2].dependsOn = [tasks[1]];
      tasks[3].dependsOn = [tasks[2]];
      tasks[4].dependsOn = [tasks[3]];
      const expectedAdapterData = [
        {},
        {
          0: "Task Id 0 SUCCESS",
        },
        {
          0: "Task Id 0 SUCCESS",
          1: "Task Id 1 SUCCESS",
        },
        {
          0: "Task Id 0 SUCCESS",
          1: "Task Id 1 SUCCESS",
          2: "Task Id 2 SUCCESS",
        },
        {
          0: "Task Id 0 SUCCESS",
          1: "Task Id 1 SUCCESS",
          2: "Task Id 2 SUCCESS",
          3: "Task Id 3 SUCCESS",
        }
      ];
      const expectedSequence = "0,1,2,3,4";
      const adapter = generateAdapter();
      const executor = new Executor(null, adapter);
      await executor.executeAndWait(tasks);
      expect(adapter.allCallData).toEqual(expectedAdapterData);
      expect(adapter.sequence.join()).toEqual(expectedSequence);
    });
    it(
      "executeAndWait: Should execute below sequence successfully & each task only get it's ancestor resolved data",
      async function () {
        /*  0->     -> 3
                  2->      -> 5
            1->     -> 4
        */
        taskId = -1;
        const executionSequence: any[] = [];
        const getTask = function () {
          taskId++;
          const id = taskId;
          const description = "Automated Task description" + id;
          return {
            name: id + "",
            description,
            execute: function (data: any) {
              executionSequence.push(data);
              return "data " + id;
            },
            getNumberOfRetries: function () {
              return 0;
            },
            getRetryDelay: function () {
              return 0;
            },
          };
        };
        const tasks: any[] = [getTask(), getTask(), getTask(), getTask(), getTask(), getTask()];
        tasks[2].dependsOn = [tasks[0], tasks[1]];
        tasks[3].dependsOn = [tasks[2]];
        tasks[4].dependsOn = [tasks[2]];
        tasks[5].dependsOn = [tasks[3], tasks[4]];
        const expectedFunParameters = [
          {},
          {},
          { 0: "data 0", 1: "data 1", },
          { 0: "data 0", 1: "data 1", 2: "data 2", },
          { 0: "data 0", 1: "data 1", 2: "data 2", },
          { 0: "data 0", 1: "data 1", 2: "data 2", 3: "data 3", 4: "data 4", }
        ];
        const executor = new Executor();
        await executor.executeAndWait(tasks);
        expect(executionSequence).toEqual(expectedFunParameters);
      }
    );
    it(
      "executeAndWait: Should execute below sequence successfully when tasks have no of retries GT(>) 1 " +
      "& each task only get it's ancestors resolved data",
      async function () {
        /*  0->     -> 3
                2->      -> 5
            1->     -> 4
        */
        taskId = -1;
        const executionSequence: any[] = [];
        const getTask = function () {
          taskId++;
          const id = taskId;
          const description = "Automated Task description" + id;
          return {
            name: id + "",
            description,
            execute: function (data: any) {
              executionSequence.push(data);
              return "data " + id;
            },
            getNumberOfRetries: function () {
              return 0;
            },
            getRetryDelay: function () {
              return 0;
            },
          };
        };
        const getTaskWithRetries = function () {
          taskId++;
          const id = taskId;
          const description = "Automated Task description" + id;
          return {
            name: id + "",
            description,
            execute: function (data: any) {
              executionSequence.push(data);
              return "data " + id;
            },
            getNumberOfRetries: function () {
              return 1;
            },
            getRetryDelay: function () {
              return 0;
            },
          };
        };
        const tasks: any[] = [getTask(), getTask(), getTask(), getTaskWithRetries(), getTaskWithRetries(), getTask()];
        tasks[2].dependsOn = [tasks[0], tasks[1]];
        tasks[3].dependsOn = [tasks[2]];
        tasks[4].dependsOn = [tasks[2]];
        tasks[5].dependsOn = [tasks[3], tasks[4]];
        const expectedFunParameters = [
          {},
          {},
          { 0: "data 0", 1: "data 1", },
          { 0: "data 0", 1: "data 1", 2: "data 2", },
          { 0: "data 0", 1: "data 1", 2: "data 2", },
          { 0: "data 0", 1: "data 1", 2: "data 2", 3: "data 3", 4: "data 4", }
        ];
        const executor = new Executor();
        await executor.executeAndWait(tasks);
        expect(executionSequence).toEqual(expectedFunParameters);
      }
    );
    it("executeAndWait: Should execute below sequence successfully", async function () {
      /*  0->
                      1->
                      2->
                      3->      -> 6
                      4->
                      5->
                  */
      taskId = -1;
      const tasks: any[] = [
        generateTask("name", false, Math.random() * 5),
        generateTask("name", false, Math.random() * 5),
        generateTask("name", false, Math.random() * 5),
        generateTask("name", false, Math.random() * 5),
        generateTask("name", false, Math.random() * 5),
        generateTask("name", false, Math.random() * 5),
        generateTask("name", false, Math.random() * 5)
      ];
      tasks[6].dependsOn = [tasks[0], tasks[1], tasks[2], tasks[3], tasks[4], tasks[5]];
      const expectedAdapterData = [
        {},
        {},
        {},
        {},
        {},
        {},
        {
          0: "Task Id 0 SUCCESS",
          1: "Task Id 1 SUCCESS",
          2: "Task Id 2 SUCCESS",
          3: "Task Id 3 SUCCESS",
          4: "Task Id 4 SUCCESS",
          5: "Task Id 5 SUCCESS",
        }
      ];
      const adapter = generateAdapter();
      const executor = new Executor(null, adapter);
      await executor.executeAndWait(tasks);
      expect(adapter.allCallData).toEqual(expectedAdapterData);
      expect(adapter.sequence[6]).toEqual("6");
    });
    it(
      "executeAndWait: Should stop execution for dependent tasks when intermediate task get failed",
      async function () {
        /*  0->     3->
                          2->     -> 5
                      1->     4->
                  */
        taskId = -1;
        const tasks: any[] = [
          generateTask("name", false, Math.random() * 5),
          generateTask("name", false, Math.random() * 5),
          generateTask("name", true, Math.random() * 5),
          generateTask("name", false, Math.random() * 5),
          generateTask("name", false, Math.random() * 5),
          generateTask("name", false, Math.random() * 5)
        ];
        tasks[2].dependsOn = [tasks[0], tasks[1]];
        tasks[3].dependsOn = [tasks[2]];
        tasks[4].dependsOn = [tasks[2]];
        tasks[5].dependsOn = [tasks[3], tasks[4]];
        const expectedAllResolvedData = {
          0: "Task Id 0 SUCCESS",
          1: "Task Id 1 SUCCESS",
        };
        const expectedAdapterData = [{}, {}, { 0: "Task Id 0 SUCCESS", 1: "Task Id 1 SUCCESS", }];
        const expectedSequences = ["0,1,2"];
        const adapter: any = generateAdapter();
        const executor = new Executor(null, adapter);
        await executor.executeAndWait(tasks).catch((allData) => {
          const executionSequenceString = adapter.sequence.join();
          expect(allData).toEqual(expectedAllResolvedData);
          expect(adapter.allCallData).toEqual(expectedAdapterData);
          expect(
            expectedSequences.some(function (sequence) {
              return sequence === executionSequenceString;
            })
          ).toBeTruthy();
        });
      }
    );
    it("executeAndWait: Should execute all task serially when serial flag is set", async function () {
      taskId = -1;
      const tasks = [
        generateTask("name", false, Math.random() * 5),
        generateTask("name", false, Math.random() * 5),
        generateTask("name", false, Math.random() * 5),
        generateTask("name", false, Math.random() * 5)
      ];
      const expectedAdapterData = [
        {},
        { 0: "Task Id 0 SUCCESS", },
        { 0: "Task Id 0 SUCCESS", 1: "Task Id 1 SUCCESS", },
        { 0: "Task Id 0 SUCCESS", 1: "Task Id 1 SUCCESS", 2: "Task Id 2 SUCCESS", }
      ];
      const expectedSequence = "0,1,2,3";
      const adapter = generateAdapter();
      const executor = new Executor(null, adapter, undefined, true);
      await executor.executeAndWait(tasks);
      expect(adapter.allCallData).toEqual(expectedAdapterData);
      expect(adapter.sequence.join()).toEqual(expectedSequence);
    });
    it(
      "executeAndWait: Should execute below sequence successfully if tasks are not required",
      async function () {
        /*
                  0-> 1 -> 2 -> 3 -> 4
      */
        taskId = -1;
        const tasks: any[] = [
          generateTask("name", false, Math.random() * 5, "promise", true),
          generateTask("name", false, Math.random() * 5, "promise", false),
          generateTask("name", false, Math.random() * 5, "promise", true),
          generateTask("name", false, Math.random() * 5, "promise", false),
          generateTask("name", false, Math.random() * 5, "promise", true)
        ];
        tasks[1].dependsOn = [tasks[0]];
        tasks[2].dependsOn = [tasks[1]];
        tasks[3].dependsOn = [tasks[2]];
        tasks[4].dependsOn = [tasks[3]];
        const expectedAdapterData = [
          {},
          { 0: "Task Id 0 SUCCESS", },
          { 0: "Task Id 0 SUCCESS", 1: {}, },
          { 0: "Task Id 0 SUCCESS", 1: {}, 2: "Task Id 2 SUCCESS", },
          { 0: "Task Id 0 SUCCESS", 1: {}, 2: "Task Id 2 SUCCESS", 3: {}, }
        ];
        const expectedSequence = "0,1,2,3,4";
        const adapter = generateAdapter();
        const executor = new Executor(null, adapter);
        await executor.executeAndWait(tasks);
        expect(adapter.allCallData).toEqual(expectedAdapterData);
        expect(adapter.sequence.join()).toEqual(expectedSequence);
      }
    );
    it(
      "executeAndWait: Should execute below sequence successfully if tasks are not required for complex dependency",
      async function () {
        /*  0->     3->
                    2->     -> 5
                1->     4->
            */
        taskId = -1;
        const tasks: any[] = [
          generateTask("name", false, Math.random() * 5, "promise", true),
          generateTask("name", false, Math.random() * 5, "promise", false),
          generateTask("name", true, Math.random() * 5, "promise", false),
          generateTask("name", false, Math.random() * 5, "promise", true),
          generateTask("name", false, Math.random() * 5, "promise", true),
          generateTask("name", false, Math.random() * 5, "promise", false)
        ];
        tasks[2].dependsOn = [tasks[0], tasks[1]];
        tasks[3].dependsOn = [tasks[2]];
        tasks[4].dependsOn = [tasks[2]];
        tasks[5].dependsOn = [tasks[3], tasks[4]];
        const expectedAdapterData = [
          {},
          {},
          { 0: "Task Id 0 SUCCESS", 1: {}, },
          { 0: "Task Id 0 SUCCESS", 1: {}, 2: {}, },
          { 0: "Task Id 0 SUCCESS", 1: {}, 2: {}, },
          { 0: "Task Id 0 SUCCESS", 1: {}, 2: {}, 3: "Task Id 3 SUCCESS", 4: "Task Id 4 SUCCESS", }
        ];
        const expectedSequence = "0,1,2,3,4,5";
        const adapter = generateAdapter();
        const executor = new Executor(null, adapter);
        await executor.executeAndWait(tasks);
        expect(adapter.allCallData).toEqual(expectedAdapterData);
        expect(adapter.sequence.join()).toEqual(expectedSequence);
      }
    );
    it(
      "executeAndWait: Should be able execute below sequence successfully when multiple name are same",
      async function () {
        /*
            0->     3->
                          2->     -> 4
                      1->     3->
                  */
        taskId = -1;
        const tasks: any[] = [
          generateTask("name", false, Math.random() * 5),
          generateTask("name", false, Math.random() * 5),
          generateTask("name", false, Math.random() * 5),
          generateTask("name", false, Math.random() * 5),
          generateTask("name", false, Math.random() * 5),
          generateTask("name", false, Math.random() * 5)
        ];
        tasks[2].dependsOn = [tasks[0], tasks[1]];
        tasks[3].dependsOn = [tasks[2]];
        tasks[4].dependsOn = [tasks[2]];
        tasks[5].dependsOn = [tasks[3], tasks[4]];
        tasks[4].name = 3;
        tasks[3].name = 3;
        tasks[5].name = 4;
        const expectedAdapterData = [
          {},
          {},
          { 0: "Task Id 0 SUCCESS", 1: "Task Id 1 SUCCESS", },
          { 0: "Task Id 0 SUCCESS", 1: "Task Id 1 SUCCESS", 2: "Task Id 2 SUCCESS", },
          { 0: "Task Id 0 SUCCESS", 1: "Task Id 1 SUCCESS", 2: "Task Id 2 SUCCESS", },
          {
            0: "Task Id 0 SUCCESS",
            1: "Task Id 1 SUCCESS",
            2: "Task Id 2 SUCCESS",
            3: ["Task Id 3 SUCCESS", "Task Id 4 SUCCESS"],
          }
        ];
        const expectedSequences = ["0,1,2,3,3,4", "1,0,2,3,3,4"];
        const adapter = generateAdapter();
        const executor = new Executor(null, adapter);
        await executor.executeAndWait(tasks);
        const executionSequenceString = adapter.sequence.join();
        expect(adapter.allCallData).toEqual(expectedAdapterData);
        expect(expectedSequences.some(function (sequence) {
          return sequence === executionSequenceString;
        })).toBeTruthy();
      }
    );
    it(
      "executeAndWait: Should execute below sequence successfully and also return all Task Data",
      async function () {
        /*           1 ->
                      4-> 3->       -> 0
                               2 ->
                  */
        taskId = -1;
        const tasks: any[] = [
          generateTask("name", false, Math.random() * 5),
          generateTask("name", false, Math.random() * 5),
          generateTask("name", false, Math.random() * 5),
          generateTask("name", false, Math.random() * 5),
          generateTask("name", false, Math.random() * 5)
        ];
        tasks[0].dependsOn = [tasks[1], tasks[2]];
        tasks[1].dependsOn = [tasks[3]];
        tasks[2].dependsOn = [tasks[3]];
        tasks[3].dependsOn = [tasks[4]];
        const expectedAdapterData = {
          0: "Task Id 0 SUCCESS",
          1: "Task Id 1 SUCCESS",
          2: "Task Id 2 SUCCESS",
          3: "Task Id 3 SUCCESS",
          4: "Task Id 4 SUCCESS",
        };
        const expectedSequences = ["4,3,2,1,0", "4,3,1,2,0"];
        const adapter = generateAdapter();
        const executor = new Executor(null, adapter);
        const allTaskData = await executor.executeAndWait(tasks);
        const executionSequenceString = adapter.sequence.join();
        expect(allTaskData).toEqual(expectedAdapterData);
        expect(
          expectedSequences.some(function (sequence) {
            return sequence === executionSequenceString;
          })
        ).toBeTruthy();
      }
    );
    it(
      "executeAndWait: Should execute below sequence successfully and also return all Task Data",
      async function () {
        /*                    1 ->
                      4-> 3->       -> 0
                              2 ->
        */
        taskId = -1;
        const tasks: any[] = [
          generateTask("name", false, Math.random() * 5),
          generateTask("name", true, Math.random() * 5),
          generateTask("name", false, Math.random() * 5),
          generateTask("name", false, Math.random() * 5),
          generateTask("name", false, Math.random() * 5)
        ];
        tasks[0].dependsOn = [tasks[1], tasks[2]];
        tasks[1].dependsOn = [tasks[3]];
        tasks[2].dependsOn = [tasks[3]];
        tasks[3].dependsOn = [tasks[4]];
        const expectedAdapterData = {
          2: "Task Id 2 SUCCESS",
          3: "Task Id 3 SUCCESS",
          4: "Task Id 4 SUCCESS",
        };
        const expectedSequences = ["4,3,2,1", "4,3,1,2"];
        const adapter = generateAdapter();
        const executor = new Executor(null, adapter);
        try {
          return await executor.executeAndWait(tasks)
        } catch (allTaskData) {
          const executionSequenceString = adapter.sequence.join();
          expect(allTaskData).toEqual(expectedAdapterData);
          expect(
            expectedSequences.some(function (sequence) {
              return sequence === executionSequenceString;
            })
          ).toBeTruthy();
        }
      }
    );
    it("executeAndWait: Should execute below sequence successfully when task is added one by one", async function () {
      /*
                      0-> 1 -> 2 -> 3 -> 4
      */
      taskId = -1;
      const tasks: any[] = [
        generateTask("name", false, Math.random() * 5),
        generateTask("name", false, Math.random() * 5),
        generateTask("name", false, Math.random() * 5),
        generateTask("name", false, Math.random() * 5),
        generateTask("name", false, Math.random() * 5)
      ];
      const expectedAdapterData = [
        {},
        {
          0: "Task Id 0 SUCCESS",
        },
        {
          0: "Task Id 0 SUCCESS",
          1: "Task Id 1 SUCCESS",
        },
        {
          0: "Task Id 0 SUCCESS",
          1: "Task Id 1 SUCCESS",
          2: "Task Id 2 SUCCESS",
        },
        {
          0: "Task Id 0 SUCCESS",
          1: "Task Id 1 SUCCESS",
          2: "Task Id 2 SUCCESS",
          3: "Task Id 3 SUCCESS",
        }
      ];
      const expectedSequence = "0,1,2,3,4";
      const adapter = generateAdapter();
      const executor = new Executor(null, adapter);
      executor.addTask(tasks[0]);
      tasks[1].dependsOn = [tasks[0]];
      executor.addTask(tasks[1]);
      tasks[2].dependsOn = [tasks[1]];
      executor.addTask(tasks[2]);
      tasks[3].dependsOn = [tasks[2]];
      executor.addTask(tasks[3]);
      tasks[4].dependsOn = [tasks[3]];
      executor.addTask(tasks[4]);
      await Promise.allSettled(executor.getTaskPromises());
      expect(adapter.allCallData).toEqual(expectedAdapterData);
      expect(adapter.sequence.join()).toEqual(expectedSequence);
    });
  })
});