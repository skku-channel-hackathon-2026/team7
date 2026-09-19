import { ProfileSchema, type Profile } from "@tutorial/shared";
import {
  ServiceError,
  nowIso,
  queryFirst,
  exec,
  type ServiceContext,
} from "./core.js";

interface ProfileRow {
  dept: string;
  admission_year: number;
  age: number;
  gender: "male" | "female";
}

export async function getProfile(sc: ServiceContext): Promise<Profile | null> {
  const row = await queryFirst<ProfileRow>(
    sc,
    "SELECT dept, admission_year, age, gender FROM profiles WHERE manager_id = ?",
    sc.userId,
  );
  return row
    ? {
        dept: row.dept,
        admissionYear: row.admission_year,
        age: row.age,
        gender: row.gender,
      }
    : null;
}

export async function requireProfile(sc: ServiceContext): Promise<Profile> {
  const profile = await getProfile(sc);
  if (!profile)
    throw new ServiceError(
      "먼저 블라인드 프로필(학과·학번·나이)을 설정해 주세요.",
      "profileRequired",
    );
  return profile;
}

export async function saveProfile(
  sc: ServiceContext,
  input: Profile,
): Promise<Profile> {
  const profile = ProfileSchema.parse(input);
  const now = nowIso(sc);
  await exec(
    sc,
    `INSERT INTO profiles (manager_id, dept, admission_year, age, gender, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(manager_id) DO UPDATE SET
       dept = excluded.dept,
       admission_year = excluded.admission_year,
       age = excluded.age,
       gender = excluded.gender,
       updated_at = excluded.updated_at`,
    sc.userId,
    profile.dept,
    profile.admissionYear,
    profile.age,
    profile.gender,
    now,
    now,
  );
  return profile;
}
