import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import ExcelJS from 'exceljs';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { sonarUrl, token, projectKey } = body;

        if (!sonarUrl || !token || !projectKey) {
            return NextResponse.json(
                { error: 'Missing required fields: sonarUrl, token, projectKey' },
                { status: 400 }
            );
        }

        // Normalize URL
        const baseUrl = sonarUrl.replace(/\/$/, '');

        // Fetch issues from SonarQube
        // We need to handle pagination. SonarQube API usually limits to 100 items per page.
        // Limit is hardcoded to 500 for now to avoid timeouts, but can be increased or paginated properly.
        // For a "mini app", we'll try to fetch all by looping.

        let allIssues: any[] = [];
        let page = 1;
        const pageSize = 500;
        let hasMore = true;

        // Basic Auth Header
        const authHeader = `Basic ${Buffer.from(`${token}:`).toString('base64')}`;

        while (hasMore) {
            const response = await axios.get(`${baseUrl}/api/issues/search`, {
                params: {
                    componentKeys: projectKey,
                    p: page,
                    ps: pageSize,
                },
                headers: {
                    Authorization: authHeader,
                },
            });

            const issues = response.data.issues;
            // console.log(issues.at(0)); return false;
            if (issues.length === 0) {
                hasMore = false;
            } else {
                allIssues = [...allIssues, ...issues];
                // Check if we reached the total
                if (response.data.total && allIssues.length >= response.data.total) {
                    hasMore = false;
                } else if (issues.length < pageSize) {
                    hasMore = false;
                } else {
                    page++;
                }
            }

            // Safety break to prevent infinite loops in case of API weirdness
            if (page > 20) break; // Limit to 10000 issues for this mini app
        }
        // return false;

        // Generate Excel
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('SonarQube Issues');

        worksheet.columns = [
            { header: 'Key', key: 'key', width: 20 },
            { header: 'Type', key: 'type', width: 15 },
            { header: 'Rule', key: 'rule', width: 15 },
            { header: 'Severity', key: 'severity', width: 15 },
            { header: 'Component', key: 'component', width: 40 },
            { header: 'Line', key: 'line', width: 40 },
            { header: 'Message', key: 'message', width: 50 },
            { header: 'Status', key: 'status', width: 15 },
            { header: 'Resolution', key: 'resolution', width: 15 },
            { header: 'Creation Date', key: 'creationDate', width: 20 },
            { header: 'Update Date', key: 'updateDate', width: 20 },
            { header: 'Number', key: 'number', width: 20 },
            { header: 'Assessment Path', key: 'ass_path_file', width: 50 },
            { header: 'Assessment Rule', key: 'ass_rule', width: 50 },
            { header: 'Assessment Message', key: 'ass_message', width: 50 },
            { header: 'Link', key: 'link', width: 20 },
        ];

        allIssues.forEach((issue, index) => {
            worksheet.addRow({
                key: issue.key,
                type: issue.type,
                rule: issue.rule,
                severity: issue.severity,
                component: issue.component,
                line: `${issue.textRange.startLine}-${issue.textRange.endLine}`,
                message: issue.message,
                status: issue.status,
                resolution: issue.resolution,
                creationDate: issue.creationDate,
                updateDate: issue.updateDate,
                number: (index + 1) + '.',
                ass_path_file: issue.component.replace(projectKey+':', '') + `:${issue.textRange.startLine}${(issue.textRange.endLine != issue.textRange.startLine ? '-' + issue.textRange.endLine : '')}`,
                ass_rule: `(Rule ${issue.rule}) ${issue.message}`,
                ass_message: issue.severity,
                link: {
                    text: `${baseUrl}/project/issues?open=${issue.key}&id=${issue.project}`,
                    hyperlink: `${baseUrl}/project/issues?open=${issue.key}&id=${issue.project}`
                },
            });
        });

        // Write to buffer
        const buffer = await workbook.xlsx.writeBuffer();

        // Return response
        return new NextResponse(buffer, {
            status: 200,
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition': 'attachment; filename="sonarqube-issues.xlsx"',
            },
        });

    } catch (error: any) {
        console.error('Error exporting issues:', error);
        return NextResponse.json(
            { error: error.message || 'Internal Server Error' },
            { status: 500 }
        );
    }
}
