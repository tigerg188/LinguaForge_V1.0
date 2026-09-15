import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownViewerProps {
  content: string;
}

const LAO_EMBLEM_LOCAL_SRC = "/lao_emblem.png";
const LAO_EMBLEM_FALLBACK_SRC = "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Emblem_of_Laos_%281991-2025%29.svg/960px-Emblem_of_Laos_%281991-2025%29.svg.png";

/**
 * Lao-to-Chinese Official Document Layout Replication Skill V1.0
 * 
 * Strict Layout Directives:
 * 1. 行距：统一为 1.15。
 * 2. 字体：老挝语统一设定为 Phetsarath OT，英语统一设定为 Times New Roman，中文正文12pt宋体，标题14pt黑体。
 * 3. 徽标：自动选用高清老挝国徽连接自动填充渲染。
 * 4. 所有文字：选用正体，严禁倾斜（禁止使用任何斜体）。
 * 5. 文本标题：固定为14pt（黑体/加粗，正体）。
 */
const MarkdownViewer: React.FC<MarkdownViewerProps> = ({ content }) => {
  return (
    <div 
      className="markdown-content text-slate-800 leading-[1.15] font-serif max-w-[210mm] mx-auto bg-white [&_*]:!not-italic"
      style={{
        fontFamily: "'Times New Roman', 'Phetsarath OT', 'Phetsarath', 'SimSun', 'Songti SC', 'STSong', serif",
        fontSize: "12pt",
        lineHeight: "1.15",
      }}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // 徽标图片渲染（使用 span.block 避免在 <p> 内产生非法的 <div> 嵌套）
          img: ({ src, alt }) => {
            const isEmblem = (alt && alt.includes('国徽')) || (src && src.includes('Emblem_of_Laos'));
            return (
              <span className="block text-center my-3">
                <img
                  src={isEmblem ? LAO_EMBLEM_LOCAL_SRC : src}
                  alt={alt || "老挝人民民主共和国国徽"}
                  onError={(e) => {
                    e.currentTarget.src = LAO_EMBLEM_FALLBACK_SRC;
                  }}
                  className="inline-block w-20 h-auto object-contain mx-auto drop-shadow-sm select-none"
                />
              </span>
            );
          },

          // 文本标题固定14pt (H1: 国名/顶部机构名)
          h1: ({ children }) => (
            <h1 
              className="font-bold text-slate-900 mt-4 mb-2 text-center tracking-normal font-sans not-italic"
              style={{
                fontFamily: "'Times New Roman', 'Phetsarath OT', 'Phetsarath', 'SimHei', 'Heiti SC', 'Microsoft YaHei', sans-serif",
                fontSize: "14pt",
                lineHeight: "1.15",
                fontStyle: "normal",
              }}
            >
              {children}
            </h1>
          ),

          // 文本标题固定14pt (H2: 文件类型，如法令/决定/命令)
          h2: ({ children }) => (
            <h2 
              className="font-bold text-slate-900 mt-3 mb-2 text-center tracking-normal font-sans not-italic"
              style={{
                fontFamily: "'Times New Roman', 'Phetsarath OT', 'Phetsarath', 'SimHei', 'Heiti SC', 'Microsoft YaHei', sans-serif",
                fontSize: "14pt",
                lineHeight: "1.15",
                fontStyle: "normal",
              }}
            >
              {children}
            </h2>
          ),

          // H3: 判断是否为国家格言（格言全部为12pt居中加粗单行间距）；若为文件主题/章节则固定14pt
          h3: ({ children }) => {
            const textContent = React.Children.toArray(children).join('');
            const isMotto = 
              textContent.includes('和平') && 
              (textContent.includes('独立') || textContent.includes('民主') || textContent.includes('统一') || textContent.includes('繁荣'));

            if (isMotto) {
              return (
                <h3 
                  className="text-center font-bold text-slate-900 my-1 font-serif not-italic"
                  style={{
                    fontFamily: "'Times New Roman', 'Phetsarath OT', 'Phetsarath', 'SimSun', 'Songti SC', 'STSong', serif",
                    fontSize: "12pt",
                    lineHeight: "1.15",
                    fontStyle: "normal",
                  }}
                >
                  {children}
                </h3>
              );
            }

            return (
              <h3 
                className="font-bold text-slate-800 mt-3 mb-2 text-center font-sans not-italic"
                style={{
                  fontFamily: "'Times New Roman', 'Phetsarath OT', 'Phetsarath', 'SimHei', 'Heiti SC', 'Microsoft YaHei', sans-serif",
                  fontSize: "14pt",
                  lineHeight: "1.15",
                  fontStyle: "normal",
                }}
              >
                {children}
              </h3>
            );
          },

          // 文本标题固定14pt (H4: 第X条 条款标题)
          h4: ({ children }) => (
            <h4 
              className="font-bold text-slate-900 mt-3.5 mb-1.5 text-left font-sans not-italic"
              style={{
                fontFamily: "'Times New Roman', 'Phetsarath OT', 'Phetsarath', 'SimHei', 'Heiti SC', 'Microsoft YaHei', sans-serif",
                fontSize: "14pt",
                lineHeight: "1.15",
                fontStyle: "normal",
              }}
            >
              {children}
            </h4>
          ),

          p: ({ children }) => {
            const textContent = React.Children.toArray(children).join('');

            // 1. 自动连接填充高清老挝国徽（返回 <p> 保持合法段落结构，避免 <div> 嵌套在 <p> 内）
            if (
              textContent.startsWith('[徽标') || 
              textContent.startsWith('[Emblem') || 
              textContent.startsWith('[Logo') || 
              textContent.includes('老挝国徽')
            ) {
              return (
                <p className="text-center my-3 select-none">
                  <img 
                    src={LAO_EMBLEM_LOCAL_SRC}
                    alt="老挝人民民主共和国国徽"
                    onError={(e) => {
                      e.currentTarget.src = LAO_EMBLEM_FALLBACK_SRC;
                    }}
                    className="inline-block w-20 h-auto object-contain mx-auto"
                  />
                </p>
              );
            }

            // 2. 国家格言检测：全部为12pt，居中，行距1.15，加粗，正体
            const isMotto = 
              textContent.includes('和平') && 
              (textContent.includes('独立') || textContent.includes('民主') || textContent.includes('统一') || textContent.includes('繁荣'));

            if (isMotto) {
              return (
                <p 
                  className="text-center font-bold text-slate-900 my-1 not-italic font-serif"
                  style={{
                    fontFamily: "'Times New Roman', 'Phetsarath OT', 'Phetsarath', 'SimSun', 'Songti SC', 'STSong', serif",
                    fontSize: "12pt",
                    lineHeight: "1.15",
                    fontStyle: "normal",
                  }}
                >
                  {children}
                </p>
              );
            }

            // 3. 签发地点与日期靠右对齐
            const isRightAlign = 
              textContent.includes('地点与日期') || 
              textContent.includes('签发地点') || 
              (textContent.startsWith('**地点') && textContent.includes('**'));

            return (
              <p 
                className={`my-1.5 text-slate-800 text-justify ${isRightAlign ? 'text-right' : ''} not-italic`}
                style={{ 
                  textIndent: 0, 
                  marginBlock: '4px',
                  fontSize: "12pt",
                  lineHeight: "1.15",
                  fontStyle: "normal",
                  fontFamily: "'Times New Roman', 'Phetsarath OT', 'Phetsarath', 'SimSun', 'Songti SC', 'STSong', serif",
                }}
              >
                {children}
              </p>
            );
          },

          // 列表项与款项 (正文12pt，行距1.15)
          ul: ({ children }) => (
            <ul className="my-2 ml-6 list-disc space-y-1 text-slate-800 not-italic" style={{ fontSize: "12pt", lineHeight: "1.15" }}>
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="my-2 ml-6 list-decimal space-y-1 text-slate-800 not-italic" style={{ fontSize: "12pt", lineHeight: "1.15" }}>
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="leading-[1.15] pl-1 not-italic" style={{ fontSize: "12pt", lineHeight: "1.15", fontStyle: "normal" }}>
              {children}
            </li>
          ),

          // 引用块（签署栏等），正体不倾斜，行距1.15
          blockquote: ({ children }) => {
            return (
              <blockquote 
                className="my-3 pl-4 text-right border-r-2 border-slate-300 pr-4 py-1 text-slate-900 font-sans not-italic"
                style={{ fontSize: "12pt", lineHeight: "1.15", fontStyle: "normal" }}
              >
                {children}
              </blockquote>
            );
          },

          // 严格禁止任何斜体 (em / i 强制正体)
          em: ({ children }) => (
            <span className="not-italic font-normal" style={{ fontStyle: "normal" }}>
              {children}
            </span>
          ),

          // 表格支持
          table: ({ children }) => (
            <div className="overflow-x-auto my-3 rounded border border-slate-300 shadow-none font-sans text-xs">
              <table className="min-w-full divide-y divide-slate-300">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-slate-50 text-slate-800 font-bold border-b border-slate-300">
              {children}
            </thead>
          ),
          tbody: ({ children }) => (
            <tbody className="divide-y divide-slate-200 bg-white">
              {children}
            </tbody>
          ),
          tr: ({ children }) => (
            <tr className="hover:bg-slate-50/50">
              {children}
            </tr>
          ),
          th: ({ children }) => (
            <th className="px-3 py-2 text-center font-bold text-slate-900 border-r border-slate-300 last:border-r-0">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-3 py-2 text-slate-800 border-r border-slate-200 last:border-r-0">
              {children}
            </td>
          ),
          strong: ({ children }) => (
            <strong className="font-bold text-slate-900 not-italic" style={{ fontStyle: "normal" }}>
              {children}
            </strong>
          ),
          hr: () => (
            <div className="relative my-8 text-center select-none print:break-before-page">
              <div className="absolute inset-0 flex items-center" aria-hidden="true">
                <div className="w-full border-t border-slate-200"></div>
              </div>
              <div className="relative flex justify-center">
                <span className="bg-white px-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest border border-slate-200 rounded-full shadow-2xs">
                  文档分页 / 分段标记
                </span>
              </div>
            </div>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};

export default MarkdownViewer;
