import { Migration } from "@mikro-orm/migrations";

export class AuthTablesMigration extends Migration {
  override name = "AuthTablesMigration";

  override up(): void {
    this.addSql(
      'create table if not exists "user" ("id" text not null primary key, "name" text not null, "email" text not null unique, "emailVerified" integer not null, "image" text, "createdAt" date not null, "updatedAt" date not null);',
    );
    this.addSql(
      'create table if not exists "session" ("id" text not null primary key, "expiresAt" date not null, "token" text not null unique, "createdAt" date not null, "updatedAt" date not null, "ipAddress" text, "userAgent" text, "userId" text not null references "user" ("id") on delete cascade);',
    );
    this.addSql(
      'create table if not exists "account" ("id" text not null primary key, "accountId" text not null, "providerId" text not null, "userId" text not null references "user" ("id") on delete cascade, "accessToken" text, "refreshToken" text, "idToken" text, "accessTokenExpiresAt" date, "refreshTokenExpiresAt" date, "scope" text, "password" text, "createdAt" date not null, "updatedAt" date not null);',
    );
    this.addSql(
      'create table if not exists "verification" ("id" text not null primary key, "identifier" text not null, "value" text not null, "expiresAt" date not null, "createdAt" date not null, "updatedAt" date not null);',
    );
    this.addSql(
      'create index if not exists "account_userId_idx" on "account" ("userId");',
    );
    this.addSql(
      'create index if not exists "session_userId_idx" on "session" ("userId");',
    );
    this.addSql(
      'create index if not exists "verification_identifier_idx" on "verification" ("identifier");',
    );
  }

  override down(): void {
    this.addSql('drop table if exists "verification";');
    this.addSql('drop table if exists "account";');
    this.addSql('drop table if exists "session";');
    this.addSql('drop table if exists "user";');
  }
}
