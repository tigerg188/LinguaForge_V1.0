
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { SYSTEM_PROMPT, GEMINI_MODEL } from "../constants";

export interface PageBatchInfo {
  startPage: number;
  endPage: number;
  totalPages: number;
}

export async function translatePage(
  base64Data: string,
  mimeType: string,
  onChunk?: (text: string) => void,
  abortSignal?: AbortSignal,
  pageInfo?: PageBatchInfo,
  modelName?: string
): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // Sanitize mimeType - Google API is strict
  let sanitizedMimeType = mimeType;
  if (mimeType.includes('pdf')) sanitizedMimeType = 'application/pdf';
  else if (mimeType.includes('png')) sanitizedMimeType = 'image/png';
  else if (mimeType.includes('webp')) sanitizedMimeType = 'image/webp';
  else sanitizedMimeType = 'image/jpeg'; // Default fallback

  const mediaPart = {
    inlineData: {
      mimeType: sanitizedMimeType,
      data: base64Data,
    },
  };

  let pageInstruction = "";
  if (pageInfo) {
    pageInstruction = `\n【重要批次指示】
当前切片正在翻译文档的【第 ${pageInfo.startPage} 页 至 第 ${pageInfo.endPage} 页】（整份文件共 ${pageInfo.totalPages} 页）。
1. 请对传入切片内的【所有页面、全部条款、细则、技术参数表、测试表单与单线图拓扑】进行 1:1 完整翻译，严禁任何摘要或省略！
2. 即使本页段内出现“公章、领导签名、附件封面或插图”，也绝对禁止提前终止输出！必须继续完整翻译完本切片内的全部后续条款与内容。
3. 复杂图表与横排表格：必须完整转换为 Markdown 结构化表格，保留所有序号、技术参数、电压等级、容量、功率因数、线径规范与校验值。
4. 单线图与电气图（SLD）：请提取其电路拓扑架构、各级断路器/隔离开关（ACB/MCCB/DS）、电流互感器（CT/VT）、逆变器、防孤岛与逆功率保护继电器走向，以清晰结构化格式展现。
5. 检查表与申请表单：保留所有选择复选框（如 [ ] 选项）、核验结论栏、签名与盖章位。`;
  }

  const stream = await ai.models.generateContentStream({
    model: modelName || GEMINI_MODEL,
    contents: [{ 
      parts: [
        mediaPart, 
        { text: `严格执行【Lao-to-Chinese Official Document Layout Replication Skill V1.0】最新排版修正规范：
1. 徽标与顶栏：国徽使用高清连接自动填充：![老挝国徽](https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Emblem_of_Laos_%281991-2025%29.svg/960px-Emblem_of_Laos_%281991-2025%29.svg.png) 或 [徽标: 老挝人民民主共和国]。
2. 国家格言强制格式：全部为12pt，居中，单行间距，加粗，正体排版（如：### 和平 独立 民主 统一 繁荣）。
3. 文本标题固定14pt：所有文本标题（国名/机构名 #、文件类型 ##、文件主题 ###、条款标题 #### 等）统一固定为14pt加粗黑体。
4. 所有文字选用正体不得倾斜：绝对禁止使用任何斜体文字（全篇所有中文、数字与外文必须使用正体）。
5. 版式结构忠实复现：老挝原公文版式结构 + 中文字体 + 中文翻译。严禁套用中国 GB/T 9704-2012 公文格式。原文件文号严禁转为〔年份〕号。条款细项严禁合并，分项条目独立排列。${pageInstruction}
请直接输出高保真 Markdown 译文。` }
      ] 
    }],
    config: {
      systemInstruction: SYSTEM_PROMPT,
      temperature: 0.1,
      maxOutputTokens: 8192
    },
  });

  let fullText = "";
  try {
    for await (const chunk of stream) {
      if (abortSignal?.aborted) break;
      const text = (chunk as GenerateContentResponse).text || "";
      fullText += text;
      onChunk?.(text);
    }
  } catch (error: any) {
    if (error.name === 'AbortError') return fullText;
    
    // Check for common backend errors and provide more readable messages
    let errorMsg = error.message || "Unknown API Error";
    if (errorMsg.includes("Unable to process input image")) {
      throw new Error("模型无法处理该输入（可能是文件损坏、加密或格式不支持）。请尝试将其转换为标准的 JPG/PNG 图片后再次上传。");
    }
    if (errorMsg.includes("429")) {
      throw new Error("请求过于频繁，请稍候再试。");
    }
    
    throw error;
  }

  return fullText;
}
