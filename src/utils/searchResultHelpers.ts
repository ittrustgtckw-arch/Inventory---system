export type SearchEntity = "client" | "equipment" | "stock" | "sold" | "project";

export interface SearchFolderItem {
  path: string;
  title: string;
  subtitle: string;
}

export interface SearchFolder {
  key: string;
  items: SearchFolderItem[];
}

export interface SearchResultRow {
  entity: SearchEntity;
  id: string;
  headline: string;
  subline: string;
  details: Record<string, string>;
  folders: SearchFolder[];
}

export function detailLabelKey(field: string): string {
  const known: Record<string, string> = {
    recordId: "dashboard.searchDetail.recordId",
    name: "dashboard.searchDetail.name",
    contactName: "dashboard.searchDetail.contactName",
    email: "dashboard.searchDetail.email",
    phone: "dashboard.searchDetail.phone",
    address: "dashboard.searchDetail.address",
    type: "dashboard.searchDetail.type",
    model: "dashboard.searchDetail.model",
    location: "dashboard.searchDetail.location",
    status: "dashboard.searchDetail.status",
    serialNumber: "dashboard.searchDetail.serialNumber",
    manufacturer: "dashboard.searchDetail.manufacturer",
    capacity: "dashboard.searchDetail.capacity",
    commissionDate: "dashboard.searchDetail.commissionDate",
    warrantyExpiry: "dashboard.searchDetail.warrantyExpiry",
    nextInspectionDate: "dashboard.searchDetail.nextInspectionDate",
    lastInspectionDate: "dashboard.searchDetail.lastInspectionDate",
    lastServiceDate: "dashboard.searchDetail.lastServiceDate",
    clientId: "dashboard.searchDetail.clientId",
    clientName: "dashboard.searchDetail.clientName",
    projectId: "dashboard.searchDetail.projectId",
    projectName: "dashboard.searchDetail.projectName",
    notes: "dashboard.searchDetail.notes",
    complianceNotes: "dashboard.searchDetail.complianceNotes",
    partNumber: "dashboard.searchDetail.partNumber",
    partDescription: "dashboard.searchDetail.partDescription",
    dateOfProcurement: "dashboard.searchDetail.dateOfProcurement",
    storageLocation: "dashboard.searchDetail.storageLocation",
    qrCode: "dashboard.searchDetail.qrCode",
    department: "dashboard.searchDetail.department",
    serialNo: "dashboard.searchDetail.serialNo",
    soldEquipmentDetails: "dashboard.searchDetail.soldEquipmentDetails",
    sellingValue: "dashboard.searchDetail.sellingValue",
    clientInfo: "dashboard.searchDetail.clientInfo",
    sellsDate: "dashboard.searchDetail.sellsDate",
    warranty: "dashboard.searchDetail.warranty",
    locationDescription: "dashboard.searchDetail.locationDescription",
    projectValue: "dashboard.searchDetail.projectValue",
    description: "dashboard.searchDetail.description",
    startDate: "dashboard.searchDetail.startDate",
    endDate: "dashboard.searchDetail.endDate",
    otherNotes: "dashboard.searchDetail.otherNotes",
  };
  return known[field] || field;
}

export const SEARCH_DATE_FIELDS_BY_ENTITY: Record<SearchEntity, string[]> = {
  client: [],
  equipment: ["commissionDate", "warrantyExpiry", "nextInspectionDate", "lastInspectionDate", "lastServiceDate"],
  stock: ["dateOfProcurement"],
  sold: ["sellsDate", "warranty"],
  project: ["startDate", "endDate"],
};
