import { test, expect } from '@playwright/test';

test.describe('问卷端到端测试', () => {
  test('完整问卷流程', async ({ page }) => {
    // 1. 访问问卷首页
    await page.goto('http://localhost:5173/demo-survey-001');
    await page.waitForLoadState('networkidle');

    // 截图：首页
    await page.screenshot({ path: 'e2e/1-首页.png' });

    // 2. 填写用户信息
    await page.fill('input[placeholder*="姓名"]', '测试用户');
    await page.fill('input[placeholder*="手机号"]', '13800138000');
    await page.fill('input[placeholder*="单位"]', '测试部门');

    // 截图：填写用户信息
    await page.screenshot({ path: 'e2e/2-填写用户信息.png' });

    // 3. 点击下一步
    await page.click('button:has-text("下一步")');

    // 4. 欢迎页
    await page.waitForURL('**/welcome');
    await page.screenshot({ path: 'e2e/3-欢迎页.png' });

    // 点击开始答题
    await page.click('button:has-text("开始")');

    // 5. 答题页 - 第1题（语音题）
    await page.waitForURL('**/survey');
    await page.screenshot({ path: 'e2e/4-第1题.png' });

    // 第2题 - 选择题
    await page.click('button:has-text("下一题")');
    await page.waitForTimeout(500);
    await page.click('text=男');  // 选择性别
    await page.screenshot({ path: 'e2e/5-第2题.png' });

    // 第3题 - 语音题
    await page.click('button:has-text("下一题")');
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'e2e/6-第3题.png' });

    // 继续答题...
    await page.click('button:has-text("下一题")');
    await page.waitForTimeout(500);
    await page.click('text=3-5年');

    await page.click('button:has-text("下一题")');
    await page.waitForTimeout(500);
    await page.click('text=比较满意');

    await page.click('button:has-text("下一题")');
    await page.waitForTimeout(500);
    await page.fill('textarea', '希望有更多的休息空间');

    await page.click('button:has-text("下一题")');
    await page.waitForTimeout(500);
    await page.click('text=弹性工作时间');
    await page.click('text=培训机会');

    await page.click('button:has-text("下一题")');
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'e2e/7-第8题.png' });

    // 提交问卷
    await page.click('button:has-text("下一题")');
    await page.waitForTimeout(1000);

    // 6. 完成页
    await page.waitForURL('**/complete');
    await page.screenshot({ path: 'e2e/8-完成页.png' });

    // 验证完成页显示
    await expect(page.locator('text=提交成功')).toBeVisible();
  });
});