/** Content bank for the "app as host" experience. Picks are deterministic per meeting. */

export interface ContentItem {
  title: string;
  body: string;
  /** Participants vote for one member (result is revealed to the room). */
  vote?: boolean;
}

export const INTRO: ContentItem = {
  title: "자기소개 타임",
  body: "이름 대신 별명으로, 좋아하는 것 하나와 요즘 빠진 것 하나를 소개해 주세요. 한 사람당 30초!",
};

export const PICK_PROMPT: ContentItem = {
  title: "💘 사랑의 짝대기",
  body: "지금 가장 같이 이야기해보고 싶은 사람을 선택하세요. 선택은 비공개이고, 결과는 애프터 단계에서 서로 선택한 경우에만 공개돼요.",
};

export const AFTER_PROMPT: ContentItem = {
  title: "애프터 의사 확인",
  body: "오늘 어땠나요? 애프터를 하고 싶은 사람을 익명으로 선택해 주세요. 서로 선택한 경우에만 결과가 공개되고, 개인 채팅방이 열려요.",
};

export const QUESTIONS: ContentItem[] = [
  { title: "랜덤 질문", body: "최근 가장 재미있었던 일은?" },
  { title: "랜덤 질문", body: "여행을 간다면 어디로 가고 싶나요?" },
  { title: "랜덤 질문", body: "요즘 가장 많이 듣는 노래는?" },
  { title: "랜덤 질문", body: "대학생활에서 가장 해보고 싶은 것은?" },
  {
    title: "랜덤 질문",
    body: "하루만 다른 학과 학생이 될 수 있다면 어느 학과?",
  },
  { title: "랜덤 질문", body: "스트레스 받을 때 나만의 해소법은?" },
  { title: "랜덤 질문", body: "인생 영화 한 편을 꼽는다면?" },
  { title: "랜덤 질문", body: "아침형 인간 vs 올빼미형 인간, 나는?" },
  { title: "랜덤 질문", body: "학식 vs 학교 앞 맛집, 오늘 점심은 어디였나요?" },
  { title: "랜덤 질문", body: "시험 기간에 꼭 하는 나만의 루틴이 있다면?" },
  { title: "랜덤 질문", body: "10년 뒤의 나는 어떤 모습일까요?" },
  { title: "랜덤 질문", body: "최근에 새로 시작한 취미가 있나요?" },
  { title: "랜덤 질문", body: "갑자기 일주일 휴가가 생긴다면 뭘 할래요?" },
  { title: "랜덤 질문", body: "친구들이 말하는 나의 첫인상은?" },
  { title: "랜덤 질문", body: "무인도에 세 가지만 가져갈 수 있다면?" },
  { title: "랜덤 질문", body: "요즘 가장 감사했던 순간은?" },
  { title: "랜덤 질문", body: "내 폰 배경화면은 무엇인가요? 이유도 함께!" },
  { title: "랜덤 질문", body: "음식 중 하나만 평생 먹어야 한다면?" },
  { title: "랜덤 질문", body: "어릴 적 꿈은 무엇이었나요?" },
  { title: "랜덤 질문", body: "이번 학기 가장 기억에 남는 수업은?" },
];

export const EVENTS: ContentItem[] = [
  {
    title: "🎲 미팅 이벤트 · 두 개의 진실, 하나의 거짓",
    body: "자기 자신에 대한 문장 세 개(진실 2 + 거짓 1)를 말하고 나머지가 거짓을 맞혀 보세요.",
  },
  {
    title: "🎲 미팅 이벤트 · 이상형 월드컵",
    body: "음식, 여행지, 영화 중 하나를 골라 두 개씩 비교하며 우리 테이블의 우승자를 정해 보세요.",
  },
  {
    title: "🎲 미팅 이벤트 · 초성 퀴즈",
    body: "돌아가며 초성 문제를 내고 맞히기! 주제는 '음식'으로 시작해요. 가장 많이 맞힌 사람은 누구?",
    vote: true,
  },
  {
    title: "🎲 미팅 이벤트 · 공통점 찾기",
    body: "3분 안에 참가자 전원의 공통점 3가지를 찾아보세요. 못 찾으면 벌칙 음료!",
  },
  {
    title: "🎲 미팅 이벤트 · 인물 퀴즈",
    body: "이마에 유명인 이름을 붙이고 예/아니오 질문으로 정체를 맞혀 보세요.",
  },
  {
    title: "🎲 미팅 이벤트 · 베스트 리액션",
    body: "지금까지 가장 리액션이 좋았던 사람을 뽑아 주세요.",
    vote: true,
  },
];

export const MISSIONS: ContentItem[] = [
  {
    title: "🎯 랜덤 미션",
    body: "가장 먼저 친해진 두 명이 아이스크림(또는 음료)을 사러 다녀오세요.",
  },
  {
    title: "🎯 랜덤 미션",
    body: "지금 우리 테이블의 셀카를 함께 찍어 보세요. 모두 다른 포즈로!",
  },
  {
    title: "🎯 랜덤 미션",
    body: "옆 사람의 장점을 세 가지 말해 주세요. (첫인상 기준)",
  },
  {
    title: "🎯 랜덤 미션",
    body: "가장 많이 웃은 사람을 뽑아주세요.",
    vote: true,
  },
  {
    title: "🎯 랜덤 미션",
    body: "오늘 가장 말을 잘 들어준 사람을 뽑아주세요.",
    vote: true,
  },
  {
    title: "🎯 랜덤 미션",
    body: "오늘의 분위기 메이커를 뽑아주세요.",
    vote: true,
  },
  {
    title: "🎯 랜덤 미션",
    body: "자리를 바꿔 앉고, 새로 옆에 앉은 사람에게 질문 하나씩 해 보세요.",
  },
  {
    title: "🎯 랜덤 미션",
    body: "각자 오늘 처음 안 사실 하나를 발표해 보세요.",
  },
];

export const TOPICS: ContentItem[] = [
  {
    title: "💬 대화 주제",
    body: "요즘 가장 힘들었던 일과 그걸 이겨낸 방법은?",
  },
  { title: "💬 대화 주제", body: "각자의 '인생 맛집' 하나씩 추천해 주세요." },
  {
    title: "💬 대화 주제",
    body: "MBTI를 믿나요? 내 결과와 실제 성격은 얼마나 닮았나요?",
  },
  { title: "💬 대화 주제", body: "이번 방학(혹은 주말)에 꼭 하고 싶은 일은?" },
  {
    title: "💬 대화 주제",
    body: "학교 근처에서 가장 좋아하는 장소는 어디인가요?",
  },
  {
    title: "💬 대화 주제",
    body: "최근 본 영상이나 드라마 중 추천할 만한 작품은?",
  },
  { title: "💬 대화 주제", body: "나에게 '좋은 하루'란 어떤 하루인가요?" },
  { title: "💬 대화 주제", body: "전공을 선택한 이유와 지금의 만족도는?" },
  { title: "💬 대화 주제", body: "버킷리스트 중 올해 안에 하나를 이룬다면?" },
  {
    title: "💬 대화 주제",
    body: "웃음 버튼! 가장 창피했지만 지금은 웃긴 실수담은?",
  },
  {
    title: "💬 대화 주제",
    body: "선호하는 데이트 스타일은 활동적? 아니면 여유로운?",
  },
  { title: "💬 대화 주제", body: "요즘 가장 자주 쓰는 앱 세 가지는?" },
  {
    title: "💬 대화 주제",
    body: "동아리나 대외활동 경험 중 가장 기억에 남는 것은?",
  },
  { title: "💬 대화 주제", body: "내가 가진 특이한 습관이 있다면?" },
  {
    title: "💬 대화 주제",
    body: "우리 학교 최고의 명당(공부/낮잠)을 소개해 주세요.",
  },
];

/** Picks an item that doesn't repeat until the pool is exhausted. */
export function pickContent(
  pool: ContentItem[],
  seed: number,
  used: number,
): ContentItem {
  return pool[(seed + used) % pool.length] as ContentItem;
}
