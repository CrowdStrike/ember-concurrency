import Ember from 'ember';

const { get, set } = Ember;

let SEEN_INDEX = 0;

const Scheduler = Ember.Object.extend({
  lastPerformed:  null,
  lastStarted:    null,
  lastRunning:    null,
  lastSuccessful: null,
  lastComplete:   null,
  lastErrored:    null,
  lastCanceled:   null,
  lastIncomplete: null,

  boundHandleFulfill: null,
  boundHandleReject: null,

  init() {
    this._super(...arguments);
    this.activeTaskInstances = [];
    this.queuedTaskInstances = [];
  },

  cancelAll() {
    let seen = [];
    this.spliceTaskInstances(this.activeTaskInstances, 0, this.activeTaskInstances.length, seen);
    this.spliceTaskInstances(this.queuedTaskInstances, 0, this.queuedTaskInstances.length, seen);
    flushTaskCounts(seen);
  },

  spliceTaskInstances(taskInstances, index, count, seen) {
    for (let i = index; i < index + count; ++i) {
      let taskInstance = taskInstances[i];
      taskInstance.cancel();
      if (seen) {
        seen.push(taskInstance.task);
      }
    }
    taskInstances.splice(index, count);
  },

  schedule(taskInstance) {
    set(this, 'lastPerformed', taskInstance);
    taskInstance.task.incrementProperty('numQueued');
    this.queuedTaskInstances.push(taskInstance);
    this._flushQueues();
  },

  _flushQueues() {
    let seen = [];

    for (let i = 0; i < this.activeTaskInstances.length; ++i) {
      seen.push(this.activeTaskInstances[i].task);
    }

    this.activeTaskInstances = filterFinished(this.activeTaskInstances);

    this.bufferPolicy.schedule(this);

    var lastStarted = null;
    for (let i = 0; i < this.activeTaskInstances.length; ++i) {
      let taskInstance = this.activeTaskInstances[i];
      if (!taskInstance.hasStarted) {
        this._startTaskInstance(taskInstance);
        lastStarted = taskInstance;
      }
      seen.push(taskInstance.task);
    }

    if (lastStarted) {
      set(this, 'lastStarted', lastStarted);
    }
    set(this, 'lastRunning', lastStarted);

    for (let i = 0; i < this.queuedTaskInstances.length; ++i) {
      seen.push(this.queuedTaskInstances[i].task);
    }

    flushTaskCounts(seen);
    set(this, 'concurrency', this.activeTaskInstances.length);
  },

  _startTaskInstance(taskInstance) {
    let task = taskInstance.task;
    task.decrementProperty('numQueued');
    task.incrementProperty('numRunning');

    taskInstance._start()._onFinalize(() => {
      task.decrementProperty('numRunning');
      var state = taskInstance._completionState;
      set(this, 'lastComplete', taskInstance);
      if (state === 1) {
        set(this, 'lastSuccessful', taskInstance);
      } else {
        if (state === 2) {
          set(this, 'lastErrored', taskInstance);
        } else if (state === 3) {
          set(this, 'lastCanceled', taskInstance);
        }
        set(this, 'lastIncomplete', taskInstance);
      }
      Ember.run.once(this, this._flushQueues);
    });
  }
});

function flushTaskCounts(tasks) {
  if(window.billy) { debugger; }
  SEEN_INDEX++;
  for (let i = 0, l = tasks.length; i < l; ++i) {
    let task = tasks[i];
    if (task._seenIndex < SEEN_INDEX) {
      task._seenIndex = SEEN_INDEX;
      updateTaskChainCounts(task);
    }
  }
}

function updateTaskChainCounts(task) {
  let numRunning = task.numRunning;
  let numQueued  = task.numQueued;
  let taskGroup = task.get('group');

  if(window.billy) { debugger; }

  while (taskGroup) {
    set(taskGroup, 'numRunning', numRunning);
    set(taskGroup, 'numQueued', numQueued);
    taskGroup = taskGroup.get('group');
  }
}

function filterFinished(taskInstances) {
  let ret = [];
  for (let i = 0, l = taskInstances.length; i < l; ++i) {
    let taskInstance = taskInstances[i];
    if (get(taskInstance, 'isFinished') === false) {
      ret.push(taskInstance);
    }
  }
  return ret;
}

export default Scheduler;

