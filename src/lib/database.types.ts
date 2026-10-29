
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "categories": {
                  Row: {
                    "active": boolean,"created_at": string,"id": string,"name": string,"position": number
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"id"?: string,"name": string,"position"?: number
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"id"?: string,"name"?: string,"position"?: number
                  }
                  Relationships: [
                    
                  ]
                },"currencies": {
                  Row: {
                    "code": string,"name": string,"rate_to_ils": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "code": string,"name": string,"rate_to_ils": number,"updated_at"?: string
                  }
                  Update: {
                    "code"?: string,"name"?: string,"rate_to_ils"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"departments": {
                  Row: {
                    "created_at": string,"id": string,"name": string,"position": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string,"position"?: number
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string,"position"?: number
                  }
                  Relationships: [
                    
                  ]
                },"invoice_history": {
                  Row: {
                    "actor_id": string | null,"changes": Json | null,"created_at": string,"from_status": Database["public"]['Enums']["invoice_status"] | null,"id": number,"invoice_id": string,"note": string | null,"to_status": Database["public"]['Enums']["invoice_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_id"?: string | null,"changes"?: Json | null,"created_at"?: string,"from_status"?: Database["public"]['Enums']["invoice_status"] | null,"id"?: never,"invoice_id": string,"note"?: string | null,"to_status": Database["public"]['Enums']["invoice_status"]
                  }
                  Update: {
                    "actor_id"?: string | null,"changes"?: Json | null,"created_at"?: string,"from_status"?: Database["public"]['Enums']["invoice_status"] | null,"id"?: never,"invoice_id"?: string,"note"?: string | null,"to_status"?: Database["public"]['Enums']["invoice_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "invoice_history_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invoice_history_invoice_id_fkey"
      columns: ["invoice_id"]
isOneToOne: false
      referencedRelation: "invoices"
      referencedColumns: ["id"]
    }
                  ]
                },"invoice_items": {
                  Row: {
                    "amount": number | null,"description": string | null,"id": string,"invoice_id": string,"position": number,"quantity": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount"?: number | null,"description"?: string | null,"id"?: string,"invoice_id": string,"position"?: number,"quantity"?: number | null
                  }
                  Update: {
                    "amount"?: number | null,"description"?: string | null,"id"?: string,"invoice_id"?: string,"position"?: number,"quantity"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "invoice_items_invoice_id_fkey"
      columns: ["invoice_id"]
isOneToOne: false
      referencedRelation: "invoices"
      referencedColumns: ["id"]
    }
                  ]
                },"invoices": {
                  Row: {
                    "allocation_number": string | null,"amount_before_vat": number | null,"category_id": string | null,"created_at": string,"currency": string,"current_approver_id": string | null,"decided_at": string | null,"decided_by": string | null,"department_id": string | null,"doc_type": Database["public"]['Enums']["doc_type"] | null,"employee_id": string,"extraction_raw": Json | null,"file_mime": string | null,"file_path": string | null,"first_approved_at": string | null,"first_approver_id": string | null,"id": string,"invoice_date": string | null,"invoice_number": string | null,"notes": string | null,"paid_at": string | null,"paid_by": string | null,"project": string | null,"rejection_reason": string | null,"status": Database["public"]['Enums']["invoice_status"],"submitted_at": string | null,"supplier_name": string | null,"supplier_tax_id": string | null,"total_amount": number | null,"total_ils": number | null,"updated_at": string,"vat_amount": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "allocation_number"?: string | null,"amount_before_vat"?: number | null,"category_id"?: string | null,"created_at"?: string,"currency"?: string,"current_approver_id"?: string | null,"decided_at"?: string | null,"decided_by"?: string | null,"department_id"?: string | null,"doc_type"?: Database["public"]['Enums']["doc_type"] | null,"employee_id"?: string,"extraction_raw"?: Json | null,"file_mime"?: string | null,"file_path"?: string | null,"first_approved_at"?: string | null,"first_approver_id"?: string | null,"id"?: string,"invoice_date"?: string | null,"invoice_number"?: string | null,"notes"?: string | null,"paid_at"?: string | null,"paid_by"?: string | null,"project"?: string | null,"rejection_reason"?: string | null,"status"?: Database["public"]['Enums']["invoice_status"],"submitted_at"?: string | null,"supplier_name"?: string | null,"supplier_tax_id"?: string | null,"total_amount"?: number | null,"total_ils"?: number | null,"updated_at"?: string,"vat_amount"?: number | null
                  }
                  Update: {
                    "allocation_number"?: string | null,"amount_before_vat"?: number | null,"category_id"?: string | null,"created_at"?: string,"currency"?: string,"current_approver_id"?: string | null,"decided_at"?: string | null,"decided_by"?: string | null,"department_id"?: string | null,"doc_type"?: Database["public"]['Enums']["doc_type"] | null,"employee_id"?: string,"extraction_raw"?: Json | null,"file_mime"?: string | null,"file_path"?: string | null,"first_approved_at"?: string | null,"first_approver_id"?: string | null,"id"?: string,"invoice_date"?: string | null,"invoice_number"?: string | null,"notes"?: string | null,"paid_at"?: string | null,"paid_by"?: string | null,"project"?: string | null,"rejection_reason"?: string | null,"status"?: Database["public"]['Enums']["invoice_status"],"submitted_at"?: string | null,"supplier_name"?: string | null,"supplier_tax_id"?: string | null,"total_amount"?: number | null,"total_ils"?: number | null,"updated_at"?: string,"vat_amount"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "invoices_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invoices_currency_fkey"
      columns: ["currency"]
isOneToOne: false
      referencedRelation: "currencies"
      referencedColumns: ["code"]
    },{
      foreignKeyName: "invoices_current_approver_id_fkey"
      columns: ["current_approver_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invoices_decided_by_fkey"
      columns: ["decided_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invoices_department_id_fkey"
      columns: ["department_id"]
isOneToOne: false
      referencedRelation: "departments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invoices_employee_id_fkey"
      columns: ["employee_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invoices_first_approver_id_fkey"
      columns: ["first_approver_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invoices_paid_by_fkey"
      columns: ["paid_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "active": boolean,"created_at": string,"department_id": string | null,"email": string,"full_name": string,"id": string,"manager_id": string | null,"role": Database["public"]['Enums']["user_role"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"department_id"?: string | null,"email": string,"full_name"?: string,"id": string,"manager_id"?: string | null,"role"?: Database["public"]['Enums']["user_role"],"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"department_id"?: string | null,"email"?: string,"full_name"?: string,"id"?: string,"manager_id"?: string | null,"role"?: Database["public"]['Enums']["user_role"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "profiles_department_id_fkey"
      columns: ["department_id"]
isOneToOne: false
      referencedRelation: "departments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "profiles_manager_id_fkey"
      columns: ["manager_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"settings": {
                  Row: {
                    "key": string,"updated_at": string,"value": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "key": string,"updated_at"?: string,"value": NonNullable<Json>
                  }
                  Update: {
                    "key"?: string,"updated_at"?: string,"value"?: NonNullable<Json>
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "app_role":
{ Args: Record<PropertyKey, never>; Returns: Database["public"]['Enums']["user_role"]
                           },
"approve_invoice":
{ Args: { "p_invoice_id": string,"p_note"?: string }; Returns: Database["public"]['Enums']["invoice_status"]
                           },
"invoice_duplicate_exists":
{ Args: { "p_exclude_id"?: string,"p_invoice_number": string,"p_supplier_name": string,"p_supplier_tax_id": string }; Returns: boolean
                           },
"is_accounting":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_my_approver":
{ Args: { "p_profile": string }; Returns: boolean
                           },
"manages":
{ Args: { "p_employee": string }; Returns: boolean
                           },
"mark_invoices_paid":
{ Args: { "p_invoice_ids": (string)[] }; Returns: number
                           },
"reject_invoice":
{ Args: { "p_invoice_id": string,"p_reason": string }; Returns: Database["public"]['Enums']["invoice_status"]
                           },
"setting_numeric":
{ Args: { "p_default": number,"p_key": string }; Returns: number
                           },
"submit_invoice":
{ Args: { "p_invoice_id": string }; Returns: Database["public"]['Enums']["invoice_status"]
                           },
"supplier_key":
{ Args: { "p_name": string,"p_tax_id": string }; Returns: string
                           }
          }
          Enums: {
            "doc_type": "tax_invoice"|"tax_invoice_receipt"|"receipt","invoice_status": "draft"|"pending"|"pending_second"|"approved"|"rejected"|"paid","user_role": "employee"|"manager"|"accounting"|"admin"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "doc_type": ["tax_invoice", "tax_invoice_receipt", "receipt"],"invoice_status": ["draft", "pending", "pending_second", "approved", "rejected", "paid"],"user_role": ["employee", "manager", "accounting", "admin"]
          }
        }
} as const
