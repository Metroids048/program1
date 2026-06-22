import { ArrowLeft, Shield } from "lucide-react";
import { navigateTo } from "../../lib/router";

const TERMS_CONTENT = `用户协议

最后更新：2025年7月

1. 服务说明
AI 求职台（以下简称"本产品"）是一款面向个人求职者的 AI 面试准备工具，提供岗位解析、模拟面试、实时助手等功能。

2. 账户与安全
2.1 您应提供真实、准确的手机号完成注册，并对账户安全负责。
2.2 不得将账户转让或出借给他人使用。
2.3 如发现未经授权使用您账户的情况，请立即联系我们。

3. 使用规则
3.1 本产品仅供个人求职练习使用，不得用于任何违法或侵犯他人权益的活动。
3.2 不得利用本产品生成虚假面试内容、冒用他人身份或实施欺诈行为。
3.3 不得对服务进行反向工程、篡改或干扰服务的正常运行。

4. 知识产权
本产品所包含的代码、设计、文案及算法模型均为产品方的知识产权，未经许可不得复制或分发。

5. 免责声明
5.1 AI 生成内容仅供参考，不构成求职建议或录用保证。
5.2 本产品不对因使用服务而产生的任何直接或间接损失承担责任。
5.3 服务可能因维护、升级或不可抗力中断，我们会尽快恢复。

6. 终止
我们保留在违反本协议的情况下暂停或终止您账户的权利。

7. 联系方式
如有任何问题，请通过产品内的反馈功能联系我们。`;

const PRIVACY_CONTENT = `隐私政策

最后更新：2025年7月

1. 信息收集
1.1 我们收集以下信息：
  - 手机号：用于账户注册和登录
  - 简历内容：您主动上传或输入的简历文本
  - 岗位信息：您输入的职位描述（JD）
  - 面试记录：模拟面试的对话内容和评分
  - 使用数据：AI 调用次数和功能使用情况

1.2 所有信息仅在您主动提供时收集。

2. 信息使用
2.1 我们使用您的信息来：
  - 提供和优化 AI 面试准备服务
  - 生成个性化的练习建议和成长报告
  - 改进 AI 模型的回答质量
  - 保障服务安全和防止滥用

2.2 我们不会将您的个人信息用于广告投放或出售给第三方。

3. 信息存储
3.1 您的数据存储在安全服务器上，采用加密传输和存储。
3.2 您可以随时导出或删除您的数据。删除操作将在 30 天内完成清理。

4. 信息共享
4.1 我们不会与第三方共享您的个人信息，除非：
  - 获得您的明确授权
  - 法律法规要求
  - 保护我们的合法权益

5. AI 模型说明
5.1 本产品使用第三方大语言模型 API 提供服务。
5.2 发送给 AI 模型的内容仅用于生成回复，不会被用于模型训练（除非模型服务商另有规定）。
5.3 模型服务商可能保留日志用于服务监控和合规目的。

6. 您的权利
6.1 您有权访问、更正、导出和删除您的个人数据。
6.2 您可以通过产品内功能或联系我们行使这些权利。

7. Cookie 政策
7.1 本产品使用必要的本地存储来维持登录状态和草稿缓存。
7.2 不使用第三方追踪 Cookie。

8. 政策更新
我们可能会更新本隐私政策，重大变更将通过站内通知或邮件告知。

9. 联系方式
如有隐私相关问题，请通过产品内的反馈功能联系我们。`;

export function LegalPage({ type }: { type: "terms" | "privacy" }) {
  const title = type === "terms" ? "用户协议" : "隐私政策";
  const content = type === "terms" ? TERMS_CONTENT : PRIVACY_CONTENT;

  return (
    <section className="page legal-page">
      <div className="legal-card">
        <div className="legal-header">
          <button type="button" className="legal-back" onClick={() => navigateTo("/account")}>
            <ArrowLeft size={16} />
            返回
          </button>
          <div className="legal-title-row">
            <Shield size={20} />
            <h1>{title}</h1>
          </div>
          <p className="legal-date">最后更新：2025年7月</p>
        </div>
        <div className="legal-body">
          {content.split("\n").map((line, index) => {
            if (!line.trim()) return <br key={index} />;
            if (/^\d+\./.test(line.trim())) return <h3 key={index}>{line}</h3>;
            if (/^\d+\.\d+/.test(line.trim())) return <h4 key={index}>{line}</h4>;
            return <p key={index}>{line}</p>;
          })}
        </div>
      </div>
    </section>
  );
}
