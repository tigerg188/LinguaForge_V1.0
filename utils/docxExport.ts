import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  ImageRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  BorderStyle,
  ShadingType,
  LineRuleType,
  convertMillimetersToTwip,
} from 'docx';

// Lao-to-Chinese Official Document Layout Replication:
// Paper: A4 (210 x 297 mm)
// Margins: Top 20mm, Bottom 20mm, Left 30mm, Right 20mm
// Line Spacing: 1.15 (line: 276, lineRule: auto)
// Lao font: Phetsarath OT
// English & Numerals: Times New Roman
// Chinese Body: SimSun (宋体) 12pt (24 half-pts), regular, upright (所有文字正体，不得倾斜)
// Text Headings: SimHei (黑体) / Bold, fixed at 14pt (28 half-pts), upright
// National Emblem: High-definition official Lao Emblem loaded and embedded

const FONT_LAO = "Phetsarath OT";
const FONT_ENGLISH = "Times New Roman";
const FONT_CHINESE_BODY = "SimSun";
const FONT_CHINESE_HEADING = "SimHei";

// In Word/OpenXML, 240 is 1.0 line spacing; 1.15 multiple = 240 * 1.15 = 276 twips
const LINE_SPACING_1_15 = 276;

const LAO_EMBLEM_URLS = [
  '/lao_emblem.png',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Emblem_of_Laos_%281991-2025%29.svg/960px-Emblem_of_Laos_%281991-2025%29.svg.png'
];

let cachedEmblemBuffer: Uint8Array | null = null;

async function getLaoEmblemBuffer(): Promise<Uint8Array | null> {
  if (cachedEmblemBuffer) return cachedEmblemBuffer;
  for (const url of LAO_EMBLEM_URLS) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        const ab = await res.arrayBuffer();
        cachedEmblemBuffer = new Uint8Array(ab);
        return cachedEmblemBuffer;
      }
    } catch {
      // Continue to next URL
    }
  }
  return null;
}

interface RunOptions {
  bold?: boolean;
  size?: number; // half-points: 12pt = 24, 14pt = 28
  color?: string;
  isHeading?: boolean;
}

/**
 * Splits plain text into language segments (Lao, English/digits, Chinese/other)
 * and creates appropriately styled TextRuns:
 * - Lao: Phetsarath OT
 * - English & Numerals: Times New Roman
 * - Chinese: SimSun (Body) / SimHei (Heading)
 */
function createTextRunsForChunk(text: string, defaultOptions: RunOptions = {}): TextRun[] {
  const defaultSize = defaultOptions.size ?? 24; // 12pt standard
  const defaultColor = defaultOptions.color ?? "1E293B";
  const defaultFont = defaultOptions.isHeading ? FONT_CHINESE_HEADING : FONT_CHINESE_BODY;

  if (!text) {
    return [
      new TextRun({
        text: "",
        font: {
          ascii: FONT_ENGLISH,
          hAnsi: FONT_ENGLISH,
          eastAsia: defaultFont,
          cs: FONT_LAO,
        },
        size: defaultSize,
        color: defaultColor,
        bold: defaultOptions.bold,
        italics: false,
      })
    ];
  }

  const chunks: { text: string; script: 'lao' | 'en' | 'cn' | 'other' }[] = [];
  let currentScript: 'lao' | 'en' | 'cn' | 'other' | '' = '';
  let currentStr = '';

  for (const char of text) {
    let script: 'lao' | 'en' | 'cn' | 'other' = 'other';
    if (/[\u0E80-\u0EFF]/.test(char)) {
      script = 'lao';
    } else if (/[A-Za-z0-9]/.test(char)) {
      script = 'en';
    } else if (/[\u4E00-\u9FFF\u3400-\u4DBF]/.test(char)) {
      script = 'cn';
    }

    if (script === 'other' && currentScript) {
      currentStr += char;
    } else if (script === currentScript || !currentScript) {
      currentScript = script || 'other';
      currentStr += char;
    } else {
      chunks.push({ text: currentStr, script: currentScript });
      currentScript = script;
      currentStr = char;
    }
  }
  if (currentStr) {
    chunks.push({ text: currentStr, script: currentScript || 'other' });
  }

  return chunks.map(chunk => {
    const isLao = chunk.script === 'lao';
    const isEnglish = chunk.script === 'en';

    return new TextRun({
      text: chunk.text,
      font: {
        ascii: isEnglish ? FONT_ENGLISH : (isLao ? FONT_LAO : defaultFont),
        hAnsi: isEnglish ? FONT_ENGLISH : (isLao ? FONT_LAO : defaultFont),
        eastAsia: defaultFont,
        cs: FONT_LAO,
      },
      size: defaultSize,
      color: defaultColor,
      bold: defaultOptions.bold,
      italics: false, // 严格正体，不得倾斜
    });
  });
}

/**
 * Parses markdown inline text (*bold*, `code`, plain).
 * Enforces strictly upright text (italics: false) across all elements.
 * Correctly assigns Phetsarath OT to Lao, Times New Roman to English, SimSun/SimHei to Chinese.
 */
function parseInlineRuns(text: string, defaultOptions: RunOptions = {}): TextRun[] {
  const runs: TextRun[] = [];
  // Tokenize markdown bold, italics, code, and text
  const regex = /(\*\*.*?\*\*|\*.*?\*|`.*?`|[^\*`]+)/g;
  const matches = text.match(regex);

  if (!matches) {
    return createTextRunsForChunk(text, defaultOptions);
  }

  for (const part of matches) {
    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      runs.push(
        ...createTextRunsForChunk(part.slice(2, -2), {
          ...defaultOptions,
          bold: true,
          color: defaultOptions.color ?? "0F172A",
        })
      );
    } else if (part.startsWith('*') && part.endsWith('*') && part.length >= 2) {
      // All text must remain upright
      runs.push(
        ...createTextRunsForChunk(part.slice(1, -1), {
          ...defaultOptions,
          color: defaultOptions.color ?? "1E293B",
        })
      );
    } else if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      runs.push(
        ...createTextRunsForChunk(part.slice(1, -1), {
          ...defaultOptions,
          color: "0F766E",
        })
      );
    } else {
      runs.push(
        ...createTextRunsForChunk(part, defaultOptions)
      );
    }
  }

  return runs;
}

export async function exportMarkdownToDocx(markdown: string, documentTitle: string = "翻译公文"): Promise<Blob> {
  const lines = markdown.split(/\r?\n/);
  const docElements: (Paragraph | Table)[] = [];

  // Preload high-definition Lao national emblem
  const emblemBuffer = await getLaoEmblemBuffer();

  let i = 0;
  while (i < lines.length) {
    const rawLine = lines[i];
    const line = rawLine.trim();

    if (!line) {
      i++;
      continue;
    }

    // 1. Table Detection
    if (line.startsWith('|') && line.endsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
        tableLines.push(lines[i].trim());
        i++;
      }

      if (tableLines.length >= 2) {
        const headerCells = tableLines[0]
          .split('|')
          .slice(1, -1)
          .map(c => c.trim());

        const isDivider = tableLines[1].replace(/[\s|:-]/g, '').length === 0;
        const dataRows = isDivider ? tableLines.slice(2) : tableLines.slice(1);

        const tableRowElements: TableRow[] = [];

        // Header Row (Table header bold with light background)
        tableRowElements.push(
          new TableRow({
            tableHeader: true,
            cantSplit: true,
            children: headerCells.map(
              cellText =>
                new TableCell({
                  shading: { fill: "F8FAFC", type: ShadingType.CLEAR },
                  children: [
                    new Paragraph({
                      alignment: AlignmentType.CENTER,
                      children: parseInlineRuns(cellText, { bold: true, color: "0F172A", size: 21, isHeading: true }),
                      spacing: { before: 80, after: 80, line: LINE_SPACING_1_15, lineRule: LineRuleType.AUTO },
                    }),
                  ],
                  margins: {
                    top: 100,
                    bottom: 100,
                    left: 120,
                    right: 120,
                  },
                })
            ),
          })
        );

        // Body Rows
        for (const dataRow of dataRows) {
          const cells = dataRow
            .split('|')
            .slice(1, -1)
            .map(c => c.trim());

          while (cells.length < headerCells.length) {
            cells.push("");
          }

          tableRowElements.push(
            new TableRow({
              cantSplit: true,
              children: cells.map(
                cellText =>
                  new TableCell({
                    children: [
                      new Paragraph({
                        alignment: AlignmentType.LEFT,
                        children: parseInlineRuns(cellText, { size: 21 }),
                        spacing: { before: 60, after: 60, line: LINE_SPACING_1_15, lineRule: LineRuleType.AUTO },
                      }),
                    ],
                    margins: {
                      top: 80,
                      bottom: 80,
                      left: 120,
                      right: 120,
                    },
                  })
              ),
            })
          );
        }

        docElements.push(
          new Table({
            width: {
              size: 100,
              type: WidthType.PERCENTAGE,
            },
            rows: tableRowElements,
            borders: {
              top: { style: BorderStyle.SINGLE, size: 4, color: "94A3B8" },
              bottom: { style: BorderStyle.SINGLE, size: 4, color: "94A3B8" },
              left: { style: BorderStyle.SINGLE, size: 4, color: "94A3B8" },
              right: { style: BorderStyle.SINGLE, size: 4, color: "94A3B8" },
              insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: "CBD5E1" },
              insideVertical: { style: BorderStyle.SINGLE, size: 2, color: "CBD5E1" },
            },
          })
        );

        docElements.push(new Paragraph({ spacing: { after: 100 } }));
        continue;
      }
    }

    // 2. High-Definition National Emblem (徽标自动连接填充)
    const isEmblemLine = 
      line.startsWith('![') || 
      line.startsWith('[徽标') || 
      line.startsWith('[Emblem') || 
      line.startsWith('[Logo') || 
      line.includes('老挝国徽');

    if (isEmblemLine) {
      if (emblemBuffer) {
        docElements.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new ImageRun({
                data: emblemBuffer,
                type: "png",
                transformation: {
                  width: 75,
                  height: 68,
                },
              }),
            ],
            spacing: { before: 120, after: 80 },
          })
        );
      } else {
        docElements.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: "〔老挝人民民主共和国国徽〕",
                bold: true,
                color: "0D9488",
                font: {
                  eastAsia: FONT_CHINESE_HEADING,
                  ascii: FONT_ENGLISH,
                  hAnsi: FONT_ENGLISH,
                  cs: FONT_LAO,
                },
                size: 24, // 12pt
                italics: false,
              }),
            ],
            spacing: { before: 120, after: 80 },
          })
        );
      }
      i++;
      continue;
    }

    // 3. Check for National Motto (国家格言：全部为12pt，居中，行距1.15，加粗，正体)
    const isMotto = 
      line.includes('和平') && 
      (line.includes('独立') || line.includes('民主') || line.includes('繁荣') || line.includes('统一'));

    if (isMotto) {
      const cleanMottoText = line.replace(/^[#\s*>\-]+|[#\s*>\-]+$/g, '').trim();
      docElements.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: createTextRunsForChunk(cleanMottoText, {
            bold: true,
            size: 24, // 12pt 固定
            color: "0F172A",
          }),
          spacing: {
            before: 0,
            after: 0,
            line: LINE_SPACING_1_15, // 1.15行距
            lineRule: LineRuleType.AUTO,
          },
        })
      );
      i++;
      continue;
    }

    // 4. Heading 1 (# 国家名称 / 发布机关名称 - 文本标题固定14pt)
    if (line.startsWith('# ')) {
      const headingText = line.substring(2).trim();
      docElements.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          alignment: AlignmentType.CENTER,
          children: parseInlineRuns(headingText, { bold: true, size: 28, color: "0F172A", isHeading: true }), // 固定14pt = 28 half-pts
          spacing: { before: 140, after: 80, line: LINE_SPACING_1_15, lineRule: LineRuleType.AUTO },
        })
      );
      i++;
      continue;
    }

    // 5. Heading 2 (## 文件类型，如总理令/决定/命令 - 文本标题固定14pt)
    if (line.startsWith('## ')) {
      const headingText = line.substring(3).trim();
      docElements.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          alignment: AlignmentType.CENTER,
          children: parseInlineRuns(headingText, { bold: true, size: 28, color: "0F172A", isHeading: true }), // 固定14pt
          spacing: { before: 140, after: 80, line: LINE_SPACING_1_15, lineRule: LineRuleType.AUTO },
        })
      );
      i++;
      continue;
    }

    // 6. Heading 3 (### 文件主题 / 章节 - 文本标题固定14pt)
    if (line.startsWith('### ')) {
      const headingText = line.substring(4).trim();
      const isChapter = headingText.includes('第') && headingText.includes('章');

      docElements.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          alignment: isChapter ? AlignmentType.CENTER : AlignmentType.CENTER,
          children: parseInlineRuns(headingText, { bold: true, size: 28, color: "0F172A", isHeading: true }), // 固定14pt
          spacing: { before: 120, after: 60, line: LINE_SPACING_1_15, lineRule: LineRuleType.AUTO },
        })
      );
      i++;
      continue;
    }

    // 7. Heading 4 (#### 第X条. 条款 / 抄送 - 文本标题固定14pt)
    if (line.startsWith('#### ')) {
      const headingText = line.substring(5).trim();
      docElements.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_4,
          alignment: AlignmentType.LEFT,
          children: parseInlineRuns(headingText, { bold: true, size: 28, color: "0F172A", isHeading: true }), // 固定14pt
          spacing: { before: 120, after: 50, line: LINE_SPACING_1_15, lineRule: LineRuleType.AUTO },
        })
      );
      i++;
      continue;
    }

    // 8. Bullet List Item (- or * or +) (e.g. Legal Basis / Sub-clauses - 正文12pt)
    if (/^[-*+]\s+/.test(line)) {
      const itemText = line.replace(/^[-*+]\s+/, '').trim();
      docElements.push(
        new Paragraph({
          bullet: { level: 0 },
          children: parseInlineRuns(itemText, { size: 24, color: "1E293B" }), // 正文12pt
          spacing: { before: 20, after: 20, line: LINE_SPACING_1_15, lineRule: LineRuleType.AUTO },
        })
      );
      i++;
      continue;
    }

    // 9. Numbered List Item (1. 2. etc. - 正文12pt)
    const numMatch = line.match(/^(\d+)\.\s+(.*)$/);
    if (numMatch) {
      const numPrefix = numMatch[1];
      const itemText = numMatch[2].trim();
      docElements.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `${numPrefix}. `,
              bold: true,
              font: {
                ascii: FONT_ENGLISH,
                hAnsi: FONT_ENGLISH,
                eastAsia: FONT_CHINESE_HEADING,
                cs: FONT_LAO,
              },
              size: 24,
              color: "0F172A",
              italics: false,
            }),
            ...parseInlineRuns(itemText, { size: 24, color: "1E293B" }),
          ],
          indent: { left: 420 },
          spacing: { before: 30, after: 30, line: LINE_SPACING_1_15, lineRule: LineRuleType.AUTO },
        })
      );
      i++;
      continue;
    }

    // 10. Blockquote (> ...) - Signature block or notes (正体，不得倾斜)
    if (line.startsWith('>')) {
      const quoteText = line.substring(1).trim();
      const isSignature = quoteText.includes('签署') || quoteText.includes('总理') || quoteText.includes('部长') || quoteText.includes('印章') || quoteText.includes('Seal');
      docElements.push(
        new Paragraph({
          alignment: isSignature ? AlignmentType.RIGHT : AlignmentType.LEFT,
          children: parseInlineRuns(quoteText, { bold: isSignature, size: 24, color: "0F172A" }),
          indent: isSignature ? { left: 3000 } : { left: 500, right: 500 },
          spacing: { before: 40, after: 40, line: LINE_SPACING_1_15, lineRule: LineRuleType.AUTO },
        })
      );
      i++;
      continue;
    }

    // 10.5 Horizontal Rule / Page Break (---)
    if (line === '---' || line === '***' || line.startsWith('---')) {
      docElements.push(
        new Paragraph({
          pageBreakBefore: true,
          spacing: { before: 80, after: 80, line: LINE_SPACING_1_15, lineRule: LineRuleType.AUTO },
        })
      );
      i++;
      continue;
    }

    // 11. Document metadata lines (文号 / 地点与日期)
    const isDocMetaRight = line.startsWith('**地点与日期') || line.startsWith('**日期') || line.includes('签发地点') || line.includes('地点与日期:');

    let alignment = AlignmentType.LEFT;
    if (isDocMetaRight) {
      alignment = AlignmentType.RIGHT;
    } else if (line.startsWith('**[') && line.endsWith(']**') && (line.includes('总理') || line.includes('部长') || line.includes('厅长'))) {
      alignment = AlignmentType.RIGHT;
    }

    docElements.push(
      new Paragraph({
        alignment,
        children: parseInlineRuns(line, { size: 24, color: "1E293B" }), // 正文12pt
        spacing: { before: 30, after: 30, line: LINE_SPACING_1_15, lineRule: LineRuleType.AUTO },
      })
    );
    i++;
  }

  // Lao-to-Chinese Official Document Layout Replication:
  // A4 paper: width = 210mm, height = 297mm
  // Margins: top = 20mm, bottom = 20mm, left = 30mm, right = 20mm
  const doc = new Document({
    title: documentTitle,
    description: "老挝公文高精度中文翻译件 - 老挝原公文版式复现",
    styles: {
      default: {
        document: {
          run: {
            font: {
              ascii: FONT_ENGLISH,
              hAnsi: FONT_ENGLISH,
              eastAsia: FONT_CHINESE_BODY,
              cs: FONT_LAO,
            },
          },
          paragraph: {
            spacing: {
              line: LINE_SPACING_1_15,
              lineRule: LineRuleType.AUTO,
            },
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: {
              width: convertMillimetersToTwip(210),
              height: convertMillimetersToTwip(297),
            },
            margin: {
              top: convertMillimetersToTwip(20),
              bottom: convertMillimetersToTwip(20),
              left: convertMillimetersToTwip(30),
              right: convertMillimetersToTwip(20),
            },
          },
        },
        children: docElements,
      },
    ],
  });

  return await Packer.toBlob(doc);
}

export async function downloadDocx(markdown: string, filename: string) {
  const blob = await exportMarkdownToDocx(markdown, filename.replace(/\.docx$/i, ''));
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.docx') ? filename : `${filename}.docx`;
  link.click();
  URL.revokeObjectURL(url);
}
