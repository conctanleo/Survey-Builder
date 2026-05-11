import db from '../src/models/db.js';

// 示例问卷数据（与前端 mock.js 保持一致）
const mockSurvey = {
  surveyId: 'demo-survey-001',
  config: {
    title: '工作环境满意度调查',
    description: '本问卷旨在了解员工对当前工作环境的真实感受，您的回答将帮助我们做出改进。',
    questionCount: 8,
    estimatedMinutes: 5,
    displayMode: 'paged',
  },
  infoFields: [
    { id: 'name', label: '姓名', type: 'text', required: true, placeholder: '请输入您的姓名' },
    { id: 'phone', label: '手机号', type: 'tel', required: true, placeholder: '请输入手机号' },
    { id: 'department', label: '所属单位', type: 'text', required: false, placeholder: '请输入单位名称' },
  ],
  questions: [
    { id: 'q1', type: 'voice', title: '请描述您对当前工作环境的总体感受', required: true, maxLength: 300 },
    { id: 'q2', type: 'choice', title: '您的性别是？', required: true, multiple: false, options: ['男', '女'] },
    { id: 'q3', type: 'voice', title: '请描述您对当前工作环境的感受', required: true, maxLength: 300 },
    { id: 'q4', type: 'choice', title: '您的工作年限是？', required: true, multiple: false, options: ['1年以内', '1-3年', '3-5年', '5-10年', '10年以上'] },
    { id: 'q5', type: 'choice', title: '您对工作环境总体满意度如何？', required: true, multiple: false, options: ['非常满意', '比较满意', '一般', '不太满意', '非常不满意'] },
    { id: 'q6', type: 'text', title: '您认为工作环境中需要改进的地方有哪些？', required: false, maxLength: 500, placeholder: '请输入您的建议' },
    { id: 'q7', type: 'choice', title: '您希望公司提供哪些福利？（多选）', required: true, multiple: true, options: ['弹性工作时间', '远程办公', '健身补贴', '培训机会', '团建活动'] },
    { id: 'q8', type: 'voice', title: '请分享您对未来工作环境改善的期望', required: false, maxLength: 300 },
  ],
};

// 检查问卷是否已存在
const existing = db.prepare('SELECT survey_id FROM surveys WHERE survey_id = ?').get(mockSurvey.surveyId);

if (existing) {
  console.log('问卷已存在，跳过初始化');
  process.exit(0);
}

// 插入问卷数据
const stmt = db.prepare(`
  INSERT INTO surveys (survey_id, config, info_fields, questions)
  VALUES (?, ?, ?, ?)
`);

stmt.run(
  mockSurvey.surveyId,
  JSON.stringify(mockSurvey.config),
  JSON.stringify(mockSurvey.infoFields),
  JSON.stringify(mockSurvey.questions)
);

console.log(`问卷 "${mockSurvey.config.title}" 初始化完成！`);
console.log(`问卷ID: ${mockSurvey.surveyId}`);
console.log(`题目数量: ${mockSurvey.questionCount}`);