'use strict'
export const STATES = Object.freeze({
  READY: 'READY',
  DONE: 'DONE',
  ERROR: 'ERROR',
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  SKIPPED: 'SKIPPED',
  NOTREQUIRED: 'NOTREQUIRED'
})
function isReady (task: Task, visitedMap: any, lookupKey = 'parents') {
  return (
    visitedMap[getTaskId(task)] === STATES.PENDING &&
    (!(task as any)[lookupKey].length ||
      (task as any)[lookupKey].reduce(
        (prev: any, pTask: any) =>
          prev &&
          (visitedMap[getTaskId(pTask)] === STATES.DONE ||
            visitedMap[getTaskId(pTask)] === STATES.NOTREQUIRED),
        true
      ))
  )
}

function getPromise () {
  const promise: any = new DeferredPromise()
  promise.promise = new Promise<any>((resolve, reject) => {
    promise.resolve = resolve
    promise.reject = reject
  })
  return promise
}

function wait (seconds: number) {
  return new Promise((resolve: any) => {
    setTimeout(() => {
      resolve()
    }, seconds * 1000)
  })
}

function fixTaskSchema (task: any, id: string | number) {
  if (typeof task === 'function') {
    task = {
      execute: task,
      type: 'function'
    }
  } else {
    task.type = 'object'
  }
  if (!task.id) {
    Object.defineProperty(task, 'id', {
      value: '' + id,
      writable: false,
      enumerable: false,
      configurable: false
    })
  }
  if (!task.getNumberOfRetries) {
    task.getNumberOfRetries = () => 0
  }
  if (!task.getRetryDelay) {
    task.getRetryDelay = () => 0
  }
  const newTask = { children: [], parents: [] }
  Object.setPrototypeOf(newTask, task)
  return newTask
}

function __getTaskIndex (tasks: any[], task: any) {
  return tasks.indexOf(task)
}
function getTaskId (task: any) {
  return task.id
}
function getTaskName (task: any) {
  return task.name || task.id
}
function __getMyAncestors (collection: any[], task: any) {
  for (const pTask of task.parents) {
    if (collection.indexOf(pTask) === -1) {
      collection.push(pTask)
      __getMyAncestors(collection, pTask)
    }
  }
}
function getMyAncestors (task: any) {
  const collection: any[] = []
  __getMyAncestors(collection, task)
  return collection
}
function findDuplicates (tasks: Task[]) {
  const duplicates: Task[] = []
  const visitedIds: any = {}
  tasks.forEach((task) => {
    const name = getTaskName(task)
    if (visitedIds[name]) {
      duplicates.push(task)
    }
    visitedIds[name] = true
  })
  return duplicates
}
function buildChainData (that: Executor, task?: Task) {
  const ancestors = task ? getMyAncestors(task) : that.tasks
  const duplicates = findDuplicates(ancestors)
  const payload: any = {}
  for (const aTask of ancestors) {
    const name = getTaskName(aTask)
    const taskId = getTaskId(aTask)
    if (that.visitedMap[taskId] === STATES.DONE) {
      if (duplicates.find((dtask) => getTaskName(dtask) === name)) {
        if (!Array.isArray(payload[name])) {
          payload[name] = []
        }
        payload[name].push(that.allTaskResponseData[taskId].data)
      } else {
        payload[name] = that.allTaskResponseData[taskId].data
      }
    }
  }
  return payload
}

function markSubTasksSkipped (that: Executor, task: any) {
  const taskIndex = __getTaskIndex(that.tasks, task)
  that.allTaskResponseData[getTaskId(task)] = null
  that.responsePromises[taskIndex].reject(null)
  updateTaskProgress(that, task, STATES.SKIPPED, null)
  for (const cTask of task.children) {
    markSubTasksSkipped(that, cTask)
  }
}
function updateTaskProgress (that: Executor, task: any, status: string, callResponse?: any) {
  that.visitedMap[getTaskId(task)] = status
  if (that.progressService) {
    that.progressService(task.type === 'object' ? task : Object.getPrototypeOf(task), status, callResponse)
  }
}

function onTaskSuccess (that: Executor, task: any, taskResponse: any) {
  const id = getTaskId(task)
  that.allTaskResponseData[id] = taskResponse
  that.responsePromises[__getTaskIndex(that.tasks, task)].resolve(taskResponse.data)
  updateTaskProgress(that, task, STATES.DONE, taskResponse.data)
  for (const cTask of task.children) {
    if (isReady(cTask, that.visitedMap)) {
      updateTaskProgress(that, cTask, STATES.READY)
      that.readyQueue.push(cTask)
    }
  }
  checkAndExecuteTask(that)
}
function onTaskNotRequired (that: Executor, task: any) {
  const id = getTaskId(task)
  const taskIndex = __getTaskIndex(that.tasks, task)
  updateTaskProgress(that, task, STATES.NOTREQUIRED)
  that.allTaskResponseData[id] = null
  that.responsePromises[taskIndex].resolve(null)
  return Promise.resolve({})
}
function onTaskFailure (that: Executor, task: any, errorResponse?: any) {
  const id = getTaskId(task)
  that.allTaskResponseData[id] = errorResponse
  that.responsePromises[__getTaskIndex(that.tasks, task)].reject(errorResponse.error)
  updateTaskProgress(that, task, STATES.ERROR, errorResponse.error)
  for (const cTask of task.children) {
    markSubTasksSkipped(that, cTask)
  }
  checkAndExecuteTask(that)
}

const executeWithRetry = async (task: any, payload: any, retries: number, delayInSeconds: number) => {
  try {
    const response = await task.execute(payload)
    return {
      data: response,
      isSuccess: true
    }
  } catch (error) {
    if (retries > 0) {
      await wait(delayInSeconds)
      const response: any = await executeWithRetry(task, payload, retries - 1, delayInSeconds)
      return {
        data: response,
        isSuccess: true
      }
    }
    return {
      error,
      isSuccess: false
    }
  }
}

async function executeTask (that: Executor, task: any) {
  updateTaskProgress(that, task, STATES.PROCESSING)
  let taskResponse: any = {}
  const chainPayload = buildChainData(that, task)
  const payload = that.adapter ? that.adapter.getPayload(task, chainPayload) : chainPayload
  if (typeof task.isRequired === 'function') {
    const validationResponse = await task.isRequired(payload)
    if (validationResponse.isRequired) {
      taskResponse = await executeWithRetry(task, payload, task.getNumberOfRetries(), task.getRetryDelay())
    } else {
      taskResponse.data = await onTaskNotRequired(that, task)
      taskResponse.isSuccess = true
    }
  } else {
    taskResponse = await executeWithRetry(task, payload, task.getNumberOfRetries(), task.getRetryDelay())
  }
  if (taskResponse && taskResponse.isSuccess) {
    onTaskSuccess(that, task, taskResponse)
  } else {
    onTaskFailure(that, task, taskResponse)
  }
}

function checkAndExecuteTask (that: Executor) {
  const currentRunning = Object.keys(that.visitedMap).filter(
    (taskId) => that.visitedMap[taskId] === STATES.PROCESSING
  ).length
  let freeSlots = (that.threadCount - currentRunning)
  while (freeSlots > 0 && that.readyQueue.length) {
    freeSlots -= 1
    executeTask(that, that.readyQueue.shift())
  }
}

function execute (that: Executor, tasks: any[]) {
  that.tasks = tasks.map((task: any, index: any) => {
    that.responsePromises.push(getPromise())
    return fixTaskSchema(task, index)
  })
  if (!that.serial) {
    for (const task of that.tasks) {
      const parentTasks = task.dependsOn || []
      for (const parentTask of parentTasks) {
        const pTask = that.tasks[__getTaskIndex(tasks, parentTask)]
        pTask.children.push(task)
        task.parents.push(pTask)
      }
    }
  } else {
    for (let taskIndex = 0; taskIndex < that.tasks.length - 1; taskIndex++) {
      that.tasks[taskIndex].children.push(that.tasks[taskIndex + 1])
      that.tasks[taskIndex + 1].parents.push(that.tasks[taskIndex])
    }
  }
  for (let taskIndex = 0; taskIndex < that.tasks.length; taskIndex++) {
    const task = that.tasks[taskIndex]
    updateTaskProgress(that, task, STATES.PENDING)
    if (isReady(task, that.visitedMap)) {
      updateTaskProgress(that, task, STATES.READY)
      that.readyQueue.push(task)
    }
  }
  checkAndExecuteTask(that)
  return {
    tasksPromises: that.responsePromises.map((promiseObj: any) => promiseObj.promise),
    processedTasks: that.tasks
  }
}

export interface Task {
  name?: string,
  execute: any,
  id: string
  getNumberOfRetries: any,
  getRetryDelay: any

}

class DeferredPromise {
  resolve: any
  reject: any
  promise: any
  constructor (promise?: Promise, resolve?: any, reject?: any) {
    this.promise = promise
    this.resolve = resolve
    this.reject = reject
  }
}
interface Promise {
  resolve: any,
  reject: any,
}

export class Executor {
  visitedMap: any
  allTaskResponseData: any
  responsePromises: any
  readyQueue: any[]
  progressService: any
  adapter: any
  threadCount: number
  serial: boolean
  tasks: any[]
  constructor (progressService?: any, adapter?: any, threadCount?: number, serial?: boolean) {
    this.visitedMap = {}
    this.allTaskResponseData = {}
    this.responsePromises = []
    this.readyQueue = []
    this.progressService = progressService
    this.adapter = adapter
    this.threadCount = threadCount || 3
    this.serial = serial || false
    this.tasks = []
  }
  async executeAndWait (tasks: any[]) {
    const { tasksPromises } = execute(this, tasks)
    const responses = await Promise.allSettled(tasksPromises)
    if (responses.find((response) => response.status === 'rejected')) {
      throw buildChainData(this)
    }
    return buildChainData(this)
  }
  getTasks () {
    return this.tasks
  }
  getTaskPromises () {
    return this.responsePromises.map((promiseObj: any) => promiseObj.promise)
  }
  getTaskStatus (task: string | Task) {
    if (typeof task !== 'string') {
      task = getTaskId(task)
    }
    return this.visitedMap[task as string]
  }
  getTaskResponses () {
    return buildChainData(this)
  }
  addTask (task: any) {
    const promiseObj = getPromise()
    this.responsePromises.push(promiseObj)
    task = fixTaskSchema(task, this.tasks.length)
    if (this.serial) {
      if (this.tasks.length) {
        const pTask = this.tasks[this.tasks.length - 1]
        pTask.children.push(task)
        task.parents.push(pTask)
      }
    } else {
      const parentTasks = task.dependsOn || []
      for (const parentTask of parentTasks) {
        const pTask = this.tasks.find((eTask) => Object.getPrototypeOf(eTask) === parentTask)
        pTask.children.push(task)
        task.parents.push(pTask)
      }
    }
    this.tasks.push(task)
    updateTaskProgress(this, task, STATES.PENDING)
    if (isReady(task, this.visitedMap)) {
      updateTaskProgress(this, task, STATES.READY)
      this.readyQueue.push(task)
    }
    checkAndExecuteTask(this)
    return promiseObj.promise
  }
}
