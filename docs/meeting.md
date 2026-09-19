# 과메기 — 대학생 블라인드 미팅 앱 (team7)

대학생들이 다른 학과와 3:3 등의 미팅을 만들고 참여하는 블라인드 미팅 플랫폼입니다.
기존 튜토리얼 구조(Channel App SDK · Cloudflare Workers · D1 · React WAM)를 그대로 사용하며,
`/tutorial` 커맨드와 튜토리얼 WAM은 변경 없이 유지됩니다.

## Channel App SDK 활용

| SDK 요소                                    | 사용 위치                                                                                                                                      |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Command Extension                           | `/meeting` 커맨드 (`server/src/tutorial.functions.ts`의 `getCommands`)                                                                         |
| Function (`@Func`)                          | `meeting.*` 33개 Function (`server/src/meeting.functions.ts`). 모든 호출은 `SignatureGuard`로 검증되고 `ctx.caller.id`(매니저)로 사용자를 식별 |
| WAM `useCallFunction`                       | 모든 화면의 서버 호출 (`wam/src/meeting/api.ts`의 `useFn`)                                                                                     |
| WAM `useNativeFunction`                     | 모집글을 현재 그룹에 내 이름으로 공유 (`writeGroupMessageAsManager`)                                                                           |
| 서버 `NativeFunctionClient`                 | 앱 봇이 연결된 팀챗 그룹에 모집·매칭·일정 리마인드·**MC 이벤트**·애프터 성사를 게시 (`writeGroupMessage`)                                      |
| `useWamSize` / `useWamClose` / `useWamData` | WAM 크기·닫기, 커맨드가 넘긴 채팅방 정보·서명된 그룹 토큰                                                                                      |

블라인드 원칙: 매칭 전 공개 정보는 학과·나이·학번뿐이며, 참가자는 미팅별 가명 키(HMAC)와
A1/B1 별칭으로만 노출됩니다. 연락처는 상호 애프터로 열린 개인 채팅에서 본인이 공유할 때만 전달됩니다.

## 주요 흐름 (v2)

- **모집:** 학교·학과·성별·인원만 입력합니다. 남성에게는 여성 모집글만, 여성에게는 남성 모집글만 보입니다 (서버 필터).
- **단체 채팅방:** 매칭되면 6명이 한 방에 모이고 "채팅방 개설이 완료되었습니다. 서로 인사하세요!"가 안내됩니다.
  날짜(TimePick처럼 가능한 시간을 격자에 드래그로 칠하고 겹치는 인원이 많은 시간 추천) → 두 학교 위치 기준 지역 추천·투표 → 장소 추천·선택 → 예약 페이지(네이버 지도) 순서로 정합니다.
- **메기남/녀:** 채팅방에서 과반 찬성하면 각 팀에 메기 초대 코드가 생기고, 메기는 미팅 시작 1시간 후 입장합니다.
  입장하면 모든 참가자 화면에 새 참가자 이벤트가 표시됩니다.
- **미팅 진행:** 누군가 "미팅 시작"을 누르면 모든 참가자의 WAM이 이벤트 전용 화면으로 전환됩니다.
  이벤트(대화 주제·아이스크림 등 미션·게임)는 **서버가** 최소 간격(10~~18분)을 두고 랜덤하게 만들고,
  호감 투표는 30~~40분 간격으로 랜덤하게 열립니다. 이벤트는 조건부 UPDATE(`event_seq`)로 한 번만 생성되어
  모든 참가자가 같은 이벤트를 읽습니다. 브라우저 타이머는 이벤트를 결정하지 않습니다.
- **호감 투표:** 결과는 "나를 선택한 사람 N명"만 공개하며 누가 선택했는지는 반환하지 않습니다.
- **랭크 탭:** 후기의 "상대 팀은 어땠나요?" 별점을 상대 학과 기준으로 평균 낸 실제 데이터입니다.

## 로컬 실행

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm build:cloudflare
corepack pnpm db:migrate:local           # 0002, 0003 마이그레이션 포함
corepack pnpm exec wrangler dev --local --port 8797   # 터미널 1
corepack pnpm dev:wam                                  # 터미널 2 → http://localhost:5173
```

`.dev.vars`는 [해커톤 가이드](../HACKATHON.ko.md)의 가짜 값을 사용합니다. Desk 밖에서는 개발 전용
브리지(`wam/src/dev`, `wam/dev`)가 AppStore처럼 요청에 서명해 로컬 Worker를 호출합니다.
왼쪽 패널에서 데모 계정을 바꿔 가며 신청 → 매칭 → MC(데모 모드: 1분 = 1초) → 짝대기 → 애프터를
테스트할 수 있습니다. 이 브리지는 프로덕션 번들에 포함되지 않습니다.

검증:

```sh
corepack pnpm test            # MC 타임라인·상호 매칭·가명 키 단위 테스트
corepack pnpm test:cloudflare # 기존 스모크
corepack pnpm test:meeting    # 미팅 전체 플로우 E2E (로컬 Worker 필요)
```

## Desk 배포 전 운영진 요청 사항

1. **원격 D1 마이그레이션**: `0002_meeting.sql`, `0003_meeting_live.sql`, `0004_meeting_availability.sql` (테이블·컬럼 추가만, 데이터 삭제 없음).
   이 스키마에 의존하는 코드이므로 main 머지 **전에** 적용을 요청하세요.
2. **익스텐션 등록 갱신**: 새 `/meeting` 커맨드와 `meeting.*` Function을 추가했으므로 배포 후 `register` 실행 요청.
3. 권한은 기존과 동일(`writeGroupMessage`, `writeGroupMessageAsManager`). 봇 알림은 공개 그룹에서만 전송됩니다.
