import Dexie from "dexie";

export const db = new Dexie("followup_crm");

db.version(1).stores({
  contacts: "id, followUpDate, done, texted, interest, addedDate",
  settings: "key",
});
