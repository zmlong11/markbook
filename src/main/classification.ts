import type { Category, MetadataSuggestion, NoteInput } from "../shared/types.js";

interface ClassificationRule {
  category: string;
  score: number;
  reason: string;
  patterns: RegExp[];
  tags: string[];
}

const CLASSIFICATION_RULES: ClassificationRule[] = [
  {
    category: "文件与目录",
    score: 3,
    reason: "命中目录浏览、复制、移动或查找命令",
    patterns: [/\bls\b/i, /\bcd\b/i, /\bpwd\b/i, /\bfind\b/i, /\blocate\b/i, /\btree\b/i, /\bcp\b/i, /\bmv\b/i, /\brm\b/i, /\bmkdir\b/i, /\btouch\b/i, /\bln\b/i, /realpath/i],
    tags: ["文件", "目录", "路径"]
  },
  {
    category: "搜索与文本处理",
    score: 3,
    reason: "命中文本搜索、过滤或结构化处理命令",
    patterns: [/\bgrep\b/i, /\begrep\b/i, /\bsed\b/i, /\bawk\b/i, /\bcut\b/i, /\bsort\b/i, /\buniq\b/i, /\btr\b/i, /\bxargs\b/i, /\bhead\b/i, /\btail\b/i, /\bwc\b/i, /\bjq\b/i, /\byq\b/i],
    tags: ["文本处理", "搜索过滤"]
  },
  {
    category: "权限与用户",
    score: 3,
    reason: "命中权限、账号或 sudo 相关操作",
    patterns: [/\bchmod\b/i, /\bchown\b/i, /\bchgrp\b/i, /\bumask\b/i, /\bsudo\b/i, /\bsu\b/i, /\bpasswd\b/i, /\buseradd\b/i, /\busermod\b/i, /\buserdel\b/i, /\bgroupadd\b/i, /\bid\b/i],
    tags: ["权限", "用户", "sudo"]
  },
  {
    category: "进程与任务",
    score: 3,
    reason: "命中进程查看、终止或后台任务命令",
    patterns: [/\bps\b/i, /\btop\b/i, /\bhtop\b/i, /\bkill\b/i, /\bpkill\b/i, /\bpgrep\b/i, /\bnohup\b/i, /\bjobs\b/i, /\bbg\b/i, /\bfg\b/i],
    tags: ["进程", "任务管理"]
  },
  {
    category: "服务与 Systemd",
    score: 4,
    reason: "命中 systemctl、service 或 journalctl 维护命令",
    patterns: [/\bsystemctl\b/i, /\bservice\b/i, /\bjournalctl\b/i, /daemon-reload/i, /unit file/i],
    tags: ["服务管理", "systemd", "systemctl"]
  },
  {
    category: "网络与端口",
    score: 4,
    reason: "命中网络连通性、端口或抓包命令",
    patterns: [/\bss\b/i, /\bnetstat\b/i, /\blsof\b/i, /\btcpdump\b/i, /\bping\b/i, /\btraceroute\b/i, /\bcurl\b/i, /\bwget\b/i, /\bifconfig\b/i, /\bip\s+addr\b/i, /\bnmcli\b/i, /\biptables\b/i, /\bnft\b/i],
    tags: ["网络", "端口", "连通性"]
  },
  {
    category: "SSH 与远程连接",
    score: 5,
    reason: "命中 ssh、scp、sftp 或远程同步命令",
    patterns: [/\bssh\b/i, /\bscp\b/i, /\bsftp\b/i, /\brsync\b/i, /authorized_keys/i, /known_hosts/i],
    tags: ["SSH", "远程连接", "传输"]
  },
  {
    category: "日志与排障",
    score: 4,
    reason: "命中日志查看、内核信息或追踪诊断命令",
    patterns: [/\/var\/log/i, /\bdmesg\b/i, /tail\s+-f/i, /\bstrace\b/i, /\bltrace\b/i, /\bjournalctl\b/i, /error|warn|failed|traceback/i],
    tags: ["日志", "排障", "诊断"]
  },
  {
    category: "磁盘与挂载",
    score: 4,
    reason: "命中磁盘容量、分区或挂载命令",
    patterns: [/\bdf\b/i, /\bdu\b/i, /\bmount\b/i, /\bumount\b/i, /\blsblk\b/i, /\bfdisk\b/i, /\bparted\b/i, /\bblkid\b/i, /\bmkfs\b/i, /\/etc\/fstab/i, /\biostat\b/i],
    tags: ["磁盘", "挂载", "存储"]
  },
  {
    category: "压缩与归档",
    score: 3,
    reason: "命中 tar、zip、gzip 等压缩命令",
    patterns: [/\btar\b/i, /\bgzip\b/i, /\bgunzip\b/i, /\bzip\b/i, /\bunzip\b/i, /\bxz\b/i, /\bbzip2\b/i, /\b7z\b/i],
    tags: ["压缩", "归档"]
  },
  {
    category: "包管理",
    score: 4,
    reason: "命中 apt、yum、dnf、rpm、dpkg 等安装命令",
    patterns: [/\bapt\b/i, /\bapt-get\b/i, /\bdnf\b/i, /\byum\b/i, /\brpm\b/i, /\bdpkg\b/i, /\bpacman\b/i, /\bsnap\b/i, /\bflatpak\b/i],
    tags: ["包管理", "软件安装"]
  },
  {
    category: "Docker 与容器",
    score: 5,
    reason: "命中 docker、podman 或 compose 命令",
    patterns: [/\bdocker\b/i, /docker-compose/i, /compose\.ya?ml/i, /\bpodman\b/i, /containerd/i],
    tags: ["容器", "Docker", "Compose"]
  },
  {
    category: "Kubernetes",
    score: 5,
    reason: "命中 kubectl、helm 或集群资源管理命令",
    patterns: [/\bkubectl\b/i, /\bhelm\b/i, /kubeconfig/i, /namespace/i, /deployment/i, /daemonset/i],
    tags: ["Kubernetes", "集群", "kubectl"]
  },
  {
    category: "Git 与版本控制",
    score: 4,
    reason: "命中 git 工作流或仓库维护命令",
    patterns: [/\bgit\b/i, /pull request/i, /commit/i, /branch/i, /merge/i, /rebase/i],
    tags: ["Git", "版本控制"]
  },
  {
    category: "Shell 与环境变量",
    score: 3,
    reason: "命中 alias、export、source 或 shell 配置",
    patterns: [/\bexport\b/i, /\balias\b/i, /\bsource\b/i, /\.bashrc/i, /\.zshrc/i, /\bprintenv\b/i, /\benv\b/i, /\becho\s+\$/i, /\bbash\b/i, /\bzsh\b/i],
    tags: ["Shell", "环境变量", "配置"]
  },
  {
    category: "定时任务",
    score: 4,
    reason: "命中 crontab、at 或周期执行配置",
    patterns: [/\bcrontab\b/i, /\/etc\/cron/i, /\bat\b/i, /schedule/i],
    tags: ["定时任务", "cron"]
  },
  {
    category: "Web 服务",
    score: 4,
    reason: "命中 nginx、apache、httpd 或 caddy 相关命令",
    patterns: [/\bnginx\b/i, /\bapachectl\b/i, /\bhttpd\b/i, /\bcaddy\b/i],
    tags: ["Web 服务", "Nginx"]
  },
  {
    category: "HTTPS 与证书",
    score: 4,
    reason: "命中 certbot、openssl 或 HTTPS 证书排障命令",
    patterns: [/\bcertbot\b/i, /openssl\s+s_client/i, /\bhttps\b/i, /\bssl\b/i, /\btls\b/i],
    tags: ["HTTPS", "证书", "TLS"]
  },
  {
    category: "性能与资源监控",
    score: 4,
    reason: "命中 CPU、内存、IO 或系统负载分析命令",
    patterns: [/\bfree\b/i, /\bvmstat\b/i, /\bsar\b/i, /\buptime\b/i, /\bmpstat\b/i, /\biostat\b/i, /load average/i, /memory/i, /cpu/i],
    tags: ["性能", "资源监控"]
  },
  {
    category: "安全与防火墙",
    score: 4,
    reason: "命中 firewall、ufw、selinux 或安全策略命令",
    patterns: [/\bufw\b/i, /firewall-cmd/i, /\bselinux\b/i, /\bsetenforce\b/i, /\bgetenforce\b/i, /fail2ban/i],
    tags: ["安全", "防火墙", "SELinux"]
  }
];

export function suggestMetadata(input: NoteInput, categories: Category[]): MetadataSuggestion {
  const text = [input.title, input.summary, input.commandText, input.contentMarkdown]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();

  if (!text.trim()) {
    return {
      categoryName: null,
      categoryId: null,
      tags: [],
      confidence: 0,
      reasons: [],
      candidateCategories: []
    };
  }

  const categoryScores = new Map<string, number>();
  const categoryReasons = new Map<string, Set<string>>();
  const tagScores = new Map<string, number>();

  for (const rule of CLASSIFICATION_RULES) {
    if (!rule.patterns.some((pattern) => pattern.test(text))) {
      continue;
    }

    categoryScores.set(rule.category, (categoryScores.get(rule.category) ?? 0) + rule.score);
    const reasons = categoryReasons.get(rule.category) ?? new Set<string>();
    reasons.add(rule.reason);
    categoryReasons.set(rule.category, reasons);

    for (const tag of rule.tags) {
      tagScores.set(tag, (tagScores.get(tag) ?? 0) + rule.score);
    }
  }


  const candidateCategories = Array.from(categoryScores.entries())
    .map(([name, score]) => ({ name, score }))
    .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name, "zh-CN"));

  const best = candidateCategories[0] ?? null;
  const second = candidateCategories[1] ?? null;
  const confidence = best
    ? Math.min(0.98, Number(((best.score + Math.max(best.score - (second?.score ?? 0), 0)) / 12).toFixed(2)))
    : 0;

  const topTags = Array.from(tagScores.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "zh-CN"))
    .slice(0, 8)
    .map(([tag]) => tag);

  const categoryName = best?.name ?? null;
  const normalizedCategoryName = categoryName ? normalizeLabel(categoryName) : null;
  const categoryId = normalizedCategoryName
    ? categories.find((item) => normalizeLabel(item.name) === normalizedCategoryName)?.id ?? null
    : null;

  return {
    categoryName,
    categoryId,
    tags: topTags,
    confidence,
    reasons: categoryName ? Array.from(categoryReasons.get(categoryName) ?? []) : [],
    candidateCategories: candidateCategories.slice(0, 4)
  };
}

function normalizeLabel(value: string): string {
  return value.trim().toLowerCase();
}

