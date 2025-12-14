class SheetSet {
  constructor(context, definition) {
    this.context = context;
    this.definition = definition;
    this.name = definition.name;
    this.headers = definition.headers;
  }

  createIdIndex() {
    const idColIndex = this.definition.headers.indexOf("id");
    if (idColIndex < 0) {
      throw new Error(`No 'id' column found in headers for ${this.name}`);
    }

    const lastRow = this.sheet.getLastRow();
    // If only headers + meta row exist, no data
    if (lastRow <= 1) {
      this.index = {};
      return;
    }

    // Read just the ID column, from row 3 down
    const numRows = lastRow - 1;
    const idValues = this.sheet
      .getRange(2, idColIndex + 1, numRows, 1)
      .getValues();

    const indexMap = {};
    for (let i = 0; i < idValues.length; i++) {
      const rowIndex = i + 2; // actual row # in sheet
      const id = idValues[i][0];
      indexMap[id] = rowIndex;
    }
    this.index = indexMap;
  }

  findById(id, depth = 0) {
    if (!this.index) {
      this.createIdIndex();
    }
    const rowIndex = this.index[id];
    if (!rowIndex) {
      return null; // not found
    }

    // read that single row from the sheet
    const rowValues = this.sheet
      .getRange(rowIndex, 1, 1, this.definition.headers.length)
      .getValues()[0];

    const obj = this.rowToObject(rowValues);

    // Optionally populate references/children for this single record
    if (depth > 0) {
      this.populateReferences([obj], depth);
    }
    if (depth > 0) {
      this.populateChildren([obj], depth);
    }

    return obj;
  }

  rowToObject(row) {
    if (row.length != this.headers.length) {
      throw new Error("The row is not valid to convert to the Set Object")
    }
    const obj = {};
    this.headers.forEach((header, index) => {
      obj[header] = row[index];
    });
    return obj;
  }

  objectToRow(obj) {
    const row = [];
    for (let i = 0; i < this.headers.length; i++) {
      row[i] = obj[this.headers[i]];
    }
    /*for (const header of this.headers) {
      row.push(obj[header])
    }*/
    return row;
  }

  where(callback) {
    return this.all().filter(callback);
  }

  all(depth = 0) {
    if (!this.context.cache[this.name]) {
      const rows = this.sheet.getDataRange().getValues();
      rows.shift();
      const data = rows.map(row => {
        return this.rowToObject(row);
      });

      if (depth > 0) {
        this.populateChildren(data, depth);
      }

      if (depth > 0) {
        this.populateReferences(data, depth);
      }

      this.context.cache[this.name] = data;
    }

    return this.context.cache[this.name];
  }

  removeAll() {
    const lastRow = this.sheet.getLastRow();
    if (lastRow > 1) {
      this.sheet.deleteRows(2, lastRow - 1);
      delete this.context.cache[this.name];
    }
  }

  remove(id) {
    if (!this.index) {
      this.createIdIndex();
    }

    const rowIndex = this.index[id];
    if (!rowIndex) {
      return; // not found
    }

    const childrenDefs = this.definition.schema.children || [];
    for (const childDef of childrenDefs) {
      const childSet = this.context[childDef.setSheet];
      const childs = childSet.all().filter(child => child[childDef.foreignField] === id)
      switch (childDef.deletion) {
        case "restrict":
          if (childs.length > 0) {
            throw new Error("Cannot delete this record because it has child records");
          }
          break;
        case "cascade":
          for (const child of childs) {
            childSet.remove(child.id);
          }
          break;
        default:
          throw new Error("Invalid deletion strategy");
      }
    }

    /*switch (this.definition.schema.deletion) {
      case "restrict":
        throw new Error("Cannot delete this record because it has child records");
      case "cascade":
        // Delete child records first
        const childrenDefs = this.definition.schema.children || [];
        for (const childDef of childrenDefs) {
          const childSet = this.context[childDef.setSheet];
          const childs = childSet.all().where(child => child[childDef.foreignField] === id)
          for (const child of childs) {
            childSet.remove(child.id);
          }
        }
        break;
      default:
        throw new Error("Invalid deletion strategy");
    }*/

    this.sheet.deleteRow(rowIndex);
    delete this.context.cache[this.name];
  }

  insert(obj, hashProperties = null) {
    if (!obj) {
      throw new Error("The object to insert cannot be undefined");
    }

    obj.id = Utilities.getUuid();
    this.definition.validate(obj, this.all());

    if (hashProperties) {
      for (const prop of hashProperties) {
        obj[prop] = hash(obj[prop]);
      }
    }

    const row = this.objectToRow(obj)

    this.sheet.appendRow(row);
    delete this.context.cache[this.name];

    return obj;
  }

  update(id, obj, hashProperties = null) {
    if (!this.index) {
      this.createIdIndex();
    }

    const rowIndex = this.index[id];
    if (!rowIndex) {
      throw new Error(`No row found with id ${id}`);
    }

    if (obj.id !== id) {
      throw new Error(`ID mismatch: ${id} != ${obj.id}`);
    }

    this.definition.validate(obj, this.all().filter(x => x.id !== id));

    if (hashProperties) {
      for (const prop of hashProperties) {
        obj[prop] = hash(obj[prop]);
      }
    }

    const row = this.objectToRow(obj);

    this.sheet.getRange(rowIndex, 1, 1, row.length).setValues([row]);
    delete this.context.cache[this.name];

    return obj;
  }
  populateChildren(parentData, depth) {
    const childrenDefs = this.definition.schema.children || [];

    for (const childDef of childrenDefs) {
      // e.g. { set:"Orders", localField:"id", foreignField:"userId", as:"orders" }
      const childSet = this.context[childDef.setSheet]; // e.g. db.Orders


      const childRows = childSet.all(depth - 1);

      // Build a grouping from childDef.foreignField -> array of child objects
      const groupMap = {};
      for (const childObj of childRows) {
        const key = childObj[childDef.foreignField];
        if (!groupMap[key]) {
          groupMap[key] = [];
        }
        groupMap[key].push(childObj);
      }

      // Attach each parent's child array
      for (const parentObj of parentData) {
        const parentKey = parentObj[childDef.localField];
        parentObj[childDef.as] = groupMap[parentKey] || [];
      }
    }
  }

  populateReferences(childData, depth) {
    const schema = this.definition.schema;

    for (const [colName, colDef] of Object.entries(schema)) {
      if (!colDef || !colDef.references) continue;

      // e.g. { set:"Users", localField:"userId", foreignField:"id", as:"user" }
      const refDef = colDef.references;
      const parentSet = this.context[refDef.sheetSet]; // e.g. db.Users
      const parentRows = parentSet.all(depth - 1);

      // Build a map from parentObj[foreignField] -> parentObj
      const lookupMap = {};
      for (const parentObj of parentRows) {
        const key = parentObj[refDef.foreignField];
        lookupMap[key] = parentObj;
      }

      // Attach each child's parent
      for (const childObj of childData) {
        const childKey = childObj[refDef.localField];
        childObj[refDef.as] = lookupMap[childKey] || null;
      }
    }
  }

}