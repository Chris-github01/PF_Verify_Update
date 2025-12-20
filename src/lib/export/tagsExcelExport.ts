import * as XLSX from 'xlsx';
import { supabase } from '../supabase';

interface TagClarification {
  id: string;
  project_id: string;
  tag_ref: string;
  tag_type: string;
  title: string;
  description: string;
  linked_scope_ref: string | null;
  origin: string;
  created_by: string | null;
  created_date: string;
  resolution_required_at: string | null;
  subcontractor_response: string | null;
  subcontractor_position: string | null;
  subcontractor_comment: string | null;
  cost_impact: string;
  programme_impact: string;
  mc_response: string | null;
  status: string;
  final_agreed_position: string | null;
}

interface ProjectInfo {
  name: string;
  client: string | null;
}

interface UserInfo {
  email: string;
}

export async function exportTagsClarificationsToExcel(
  projectId: string,
  projectName: string,
  contractNo?: string
): Promise<void> {
  try {
    const { data: tags, error: tagsError } = await supabase
      .from('contract_tags_clarifications')
      .select('*')
      .eq('project_id', projectId)
      .order('sort_order', { ascending: true });

    if (tagsError) {
      console.error('Error fetching tags:', tagsError);
      throw new Error('Failed to fetch tags and clarifications');
    }

    if (!tags || tags.length === 0) {
      throw new Error('No tags or clarifications to export');
    }

    const { data: project } = await supabase
      .from('projects')
      .select('name, client')
      .eq('id', projectId)
      .maybeSingle();

    const mainContractor = project?.client || 'Main Contractor';

    const userIds = tags
      .map((t: any) => t.created_by)
      .filter((id: string | null) => id !== null);

    const uniqueUserIds = [...new Set(userIds)];

    let userEmailMap: Record<string, string> = {};

    if (uniqueUserIds.length > 0) {
      const { data: userData } = await supabase
        .from('organisation_members')
        .select('user_id')
        .in('user_id', uniqueUserIds);

      if (userData) {
        for (const member of userData) {
          const { data: authUser } = await supabase.auth.admin.getUserById(member.user_id);
          if (authUser?.user?.email) {
            userEmailMap[member.user_id] = authUser.user.email;
          }
        }
      }
    }

    const excelData = tags.map((tag: any) => {
      const createdBy = tag.created_by ? userEmailMap[tag.created_by] || 'Unknown' : 'System';
      const createdDate = tag.created_date
        ? new Date(tag.created_date).toLocaleDateString('en-NZ')
        : '';

      return {
        'Main Contractor': mainContractor,
        'Tag Ref': tag.tag_ref || '',
        'Tag Type': tag.tag_type || '',
        'Title': tag.title || '',
        'Description': tag.description || '',
        'Linked Scope Ref': tag.linked_scope_ref || '',
        'Origin': tag.origin || '',
        'Created By': createdBy,
        'Created Date': createdDate,
        'Resolution Required At': tag.resolution_required_at || '',
        'Subcontractor Response': tag.subcontractor_response || '',
        'Subcontractor Position': tag.subcontractor_position || '',
        'Subcontractor Comment': tag.subcontractor_comment || '',
        'Cost Impact': tag.cost_impact || 'None',
        'Programme Impact': tag.programme_impact || 'None',
        'Main Contractor Response': tag.mc_response || '',
        'Status': tag.status || 'Open',
        'Final Agreed Position': tag.final_agreed_position || ''
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(excelData);

    const columnWidths = [
      { wch: 20 }, // Main Contractor
      { wch: 12 }, // Tag Ref
      { wch: 15 }, // Tag Type
      { wch: 30 }, // Title
      { wch: 50 }, // Description
      { wch: 15 }, // Linked Scope Ref
      { wch: 15 }, // Origin
      { wch: 25 }, // Created By
      { wch: 12 }, // Created Date
      { wch: 20 }, // Resolution Required At
      { wch: 40 }, // Subcontractor Response
      { wch: 25 }, // Subcontractor Position
      { wch: 40 }, // Subcontractor Comment
      { wch: 20 }, // Cost Impact
      { wch: 20 }, // Programme Impact
      { wch: 40 }, // Main Contractor Response
      { wch: 12 }, // Status
      { wch: 40 }  // Final Agreed Position
    ];
    worksheet['!cols'] = columnWidths;

    const headerRange = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
    for (let col = headerRange.s.c; col <= headerRange.e.c; col++) {
      const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col });
      if (worksheet[cellAddress]) {
        worksheet[cellAddress].s = {
          font: { bold: true, color: { rgb: 'FFFFFF' } },
          fill: { fgColor: { rgb: '1e293b' } },
          alignment: { vertical: 'center', horizontal: 'left', wrapText: true }
        };
      }
    }

    for (let row = 1; row <= headerRange.e.r; row++) {
      for (let col = 10; col <= 13; col++) {
        const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
        if (worksheet[cellAddress]) {
          worksheet[cellAddress].s = {
            fill: { fgColor: { rgb: 'FFF9C4' } },
            alignment: { vertical: 'top', horizontal: 'left', wrapText: true }
          };
        }
      }
    }

    const tagTypeValidation = {
      type: 'list',
      allowBlank: false,
      formula1: '"Assumption,Clarification,Risk,Hold Point"'
    };

    const resolutionValidation = {
      type: 'list',
      allowBlank: true,
      formula1: '"Pre-let,Post-contract"'
    };

    const positionValidation = {
      type: 'list',
      allowBlank: true,
      formula1: '"Agree,Disagree,Amend,Clarification Required"'
    };

    const costImpactValidation = {
      type: 'list',
      allowBlank: false,
      formula1: '"None,Potential,Confirmed,Variation Required"'
    };

    const programmeImpactValidation = {
      type: 'list',
      allowBlank: false,
      formula1: '"None,Potential,Confirmed"'
    };

    const statusValidation = {
      type: 'list',
      allowBlank: false,
      formula1: '"Open,Agreed,To Pre-let,Closed"'
    };

    if (!worksheet['!dataValidation']) {
      worksheet['!dataValidation'] = [];
    }

    for (let row = 2; row <= headerRange.e.r + 1; row++) {
      worksheet['!dataValidation'].push({
        sqref: `C${row}`,
        ...tagTypeValidation
      });
      worksheet['!dataValidation'].push({
        sqref: `J${row}`,
        ...resolutionValidation
      });
      worksheet['!dataValidation'].push({
        sqref: `L${row}`,
        ...positionValidation
      });
      worksheet['!dataValidation'].push({
        sqref: `N${row}`,
        ...costImpactValidation
      });
      worksheet['!dataValidation'].push({
        sqref: `O${row}`,
        ...programmeImpactValidation
      });
      worksheet['!dataValidation'].push({
        sqref: `Q${row}`,
        ...statusValidation
      });
    }

    worksheet['!autofilter'] = { ref: worksheet['!ref'] || 'A1' };

    if (worksheet['!freeze']) {
      worksheet['!freeze'] = { xSplit: 0, ySplit: 1 };
    }

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Tags & Clarifications');

    const today = new Date().toISOString().split('T')[0];
    const safeProjectName = projectName.replace(/[^a-z0-9]/gi, '_');
    const safeContractNo = contractNo ? `_${contractNo.replace(/[^a-z0-9]/gi, '_')}` : '';
    const filename = `Tags_Clarifications_${safeProjectName}${safeContractNo}_${today}.xlsx`;

    XLSX.writeFile(workbook, filename);

    console.log('Tags & Clarifications exported successfully');
  } catch (error) {
    console.error('Error exporting tags & clarifications:', error);
    throw error;
  }
}
