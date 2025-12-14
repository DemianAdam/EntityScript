function createContext(spreadSheetId, entityDefinitions){
  return new Context(spreadSheetId, entityDefinitions);
}

class Context {
  constructor(spreadSheetId, entityDefinitions) {
    if (!spreadSheetId) {
      throw new Error("Must provide a Spreadsheet ID.");
    }
    this.document = SpreadsheetApp.openById(spreadSheetId);
    this.cache = {}; // Cache to store sheet data
    
    const sheets = this.document.getSheets();
    for (const definition of entityDefinitions) {
      this[definition.name] = new SheetSet(this, definition);
      let sheet = sheets.find((x) => x.getName() == definition.name)
      if (!sheet) {
        sheet = this.document.insertSheet(definition.name)
        sheet.appendRow(definition.headers)
      }

      if(definition.headers.length != sheet.getLastColumn()){
        sheet.getRange(1, 1, 1, sheet.getLastColumn()).clear();
        sheet.getRange(1, 1,1,definition.headers.length).setValues([definition.headers]);
      }

      this[definition.name].sheet = sheet;
    }

  }

  
}