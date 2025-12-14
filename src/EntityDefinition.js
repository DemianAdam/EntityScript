function createEntityDefinition(name, schema) {
  return new EntityDefinition(name, schema);
}

class EntityDefinition {
  constructor(name, schema) {
    this.name = name;
    this.schema = schema;
    this.headers = Object.keys(schema).filter(k => k !== 'children')
    this.defaultValues = this.headers.map(col => schema[col].defaultValue);
  }

  validate(obj, list) {
    for (const colName in this.schema) {
      const colDef = this.schema[colName];
      const value = obj[colName];

      if (isHashed(value) && colDef.isHashed) {
        continue;
      }

      if (!value && colDef.defaultValue) {
        obj[colName] = colDef.defaultValue;
      }

      if (colDef.required && (value === undefined || value === null || value === '')) {
        throw new Error(`Column "${colName}" is required but not provided.`);
      }

      if (colDef.required && colDef.type === 'number') {
        if (isNaN(Number(value))) {
          throw new Error(`Column "${colName}" must be a number. Value: ${value}. Type: ${typeof (value)}`);
        }
        obj[colName] = Number(value); // convert to number, if desired
      }
      else if (colDef.required && colDef.type === 'string') {
        // convert to string or check typeof
        obj[colName] = String(value);
      }
      else if (colDef.required && colDef.type === "date") {
        if (isNaN(Date.parse(value))) {
          throw new Error(`Column "${colName}" must be a date. Value: ${value}. Type: ${typeof (value)}`);
        }
        obj[colName] = new Date(value);
      }

      if (colDef.regex && !colDef.regex.test(obj[colName])) {
        throw new Error(colDef.errorMsg + " " + obj[colName] || `Invalid format for "${colName}".`);
      }

      if (typeof colDef.min === 'number' && obj[colName] < colDef.min) {
        throw new Error(`Column "${colName}" cannot be less than ${colDef.min}.`);
      }

      if (typeof colDef.max === 'number' && obj[colName] > colDef.max) {
        throw new Error(`Column "${colName}" cannot be greater than ${colDef.max}.`);
      }

      if (colDef.unique && list.some(x => x[colName] === value)) {
        const UniqueError = { message: `Column "${colName}" must be unique. Value "${value}" already exists.`, code: 'UniqueError', data: { colName, value } };
        throw UniqueError;
      }

      if (typeof colDef.validate === 'function') {
        colDef.validate(obj[colName], list, obj);
      }
    }

  }
}