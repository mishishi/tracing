"""Test tracing_sdk with 2 CrewAI projects — minimal integration smoke test."""

import tracing_sdk

# ── Project A ──
tracing_sdk.init(project="project-alpha")

from crewai import Agent, Task, Crew

agent_a = Agent(
    role="研究员",
    goal="分析市场趋势",
    backstory="你是一位资深市场研究员",
    allow_delegation=False,
    verbose=False,
)

task_a = Task(
    description="用一句话总结当前AI市场的趋势。回复要简短。",
    expected_output="一句话总结",
    agent=agent_a,
)

crew_a = Crew(agents=[agent_a], tasks=[task_a], verbose=False)
result_a = crew_a.kickoff()
print(f"[project-alpha] 结果: {str(result_a)[:80]}...")

# ── Project B ──
tracing_sdk.init(project="project-beta")

agent_b = Agent(
    role="工程师",
    goal="编写代码",
    backstory="你是一位资深软件工程师",
    allow_delegation=False,
    verbose=False,
)

task_b = Task(
    description="写一个Python函数来计算斐波那契数列。只输出代码。",
    expected_output="Python代码",
    agent=agent_b,
)

crew_b = Crew(agents=[agent_b], tasks=[task_b], verbose=False)
result_b = crew_b.kickoff()
print(f"[project-beta] 结果: {str(result_b)[:80]}...")

print("\n=== 完成 ===")
print("打开 http://localhost:9201 查看追踪面板")
print("- 切换 project 筛选查看两个项目的 Span")
print("- 打开「对比」Tab 选择 project-alpha + project-beta 对比")
