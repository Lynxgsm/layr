import {Identity} from './identity';

export class Entity extends Identity {
  constructor(object, options) {
    super(object, options);

    this.constructor.$setInstance(this);
  }

  $serialize({target, fields, isDeep} = {}) {
    if (isDeep) {
      return this.$serializeReference({target});
    }
    return super.$serialize({target, fields, isDeep});
  }

  $serializeReference({target} = {}) {
    if (this.$isNew()) {
      throw new Error(`Cannot serialize a reference to a new entity`);
    }
    return {...super.$serialize({target, fields: false, isDeep: true}), _ref: true};
  }

  $clone() {
    return this.constructor.$deserialize({...this.$serialize(), _id: undefined});
  }

  $getFailedValidators({fields, isDeep} = {}) {
    if (isDeep) {
      return undefined;
    }
    return super.$getFailedValidators({fields, isDeep});
  }

  static $getInstance(object, _previousInstance) {
    const id = object?._id;
    if (id === undefined) {
      return undefined;
    }
    return this.__getInstances().get(id);
  }

  static $setInstance(instance) {
    const id = instance?._id;
    if (id === undefined) {
      return;
    }
    this.__getInstances().set(id, instance);
  }

  static __getInstances() {
    if (!Object.prototype.hasOwnProperty.call(this, '__instances')) {
      this.__instances = new Map();
    }
    return this.__instances;
  }
}
