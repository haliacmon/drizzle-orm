import 'dotenv/config';

import { connect } from '@planetscale/database';
import { desc, DrizzleError, eq, gt, gte, or, placeholder, sql, TransactionRollbackError } from 'drizzle-orm';
import { drizzle, type PlanetScaleDatabase } from 'drizzle-orm/planetscale-serverless';
import { beforeAll, beforeEach, expect, expectTypeOf, test } from 'vitest';
import * as schema from './mysql.schema.ts';

const { usersTable, postsTable, commentsTable, usersToGroupsTable, groupsTable, notes } = schema;

const ENABLE_LOGGING = false;

/*
	Test cases:
	- querying nested relation without PK with additional fields
*/

let db: PlanetScaleDatabase<typeof schema>;

beforeAll(async () => {
	db = drizzle(
		connect({
			url: process.env['PLANETSCALE_CONNECTION_STRING']!,
			// host: process.env['DATABASE_HOST']!,
			// username: process.env['DATABASE_USERNAME']!,
			// password: process.env['DATABASE_PASSWORD']!,
		}),
		{ schema, logger: ENABLE_LOGGING },
	);
});

beforeEach(async () => {
	await db.execute(sql`drop table if exists \`users\``);
	await db.execute(sql`drop table if exists \`groups\``);
	await db.execute(sql`drop table if exists \`users_to_groups\``);
	await db.execute(sql`drop table if exists \`posts\``);
	await db.execute(sql`drop table if exists \`comments\``);
	await db.execute(sql`drop table if exists \`comment_likes\``);
	await db.execute(sql`drop table if exists \`notes\``);

	await db.execute(
		sql`
			CREATE TABLE \`users\` (
				\`id\` bigint PRIMARY KEY AUTO_INCREMENT NOT NULL,
				\`name\` text NOT NULL,
				\`verified\` boolean DEFAULT false NOT NULL,
				\`invited_by\` bigint
			);
		`,
	);
	await db.execute(
		sql`
			CREATE TABLE \`groups\` (
				\`id\` bigint PRIMARY KEY AUTO_INCREMENT NOT NULL,
				\`name\` text NOT NULL,
				\`description\` text
			);
		`,
	);
	await db.execute(
		sql`
			CREATE TABLE \`users_to_groups\` (
				\`id\` serial PRIMARY KEY AUTO_INCREMENT NOT NULL,
				\`user_id\` bigint,
				\`group_id\` bigint
			);
		`,
	);
	await db.execute(
		sql`
			CREATE TABLE \`posts\` (
				\`id\` bigint PRIMARY KEY AUTO_INCREMENT NOT NULL,
				\`content\` text NOT NULL,
				\`owner_id\` bigint,
				\`created_at\` timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
			);
		`,
	);
	await db.execute(
		sql`
			CREATE TABLE \`comments\` (
				\`id\` bigint PRIMARY KEY AUTO_INCREMENT NOT NULL,
				\`content\` text NOT NULL,
				\`creator\` bigint,
				\`post_id\` bigint,
				\`created_at\` timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
			);
		`,
	);
	await db.execute(
		sql`
			CREATE TABLE \`comment_likes\` (
				\`id\` bigint PRIMARY KEY AUTO_INCREMENT NOT NULL,
				\`creator\` bigint,
				\`comment_id\` bigint,
				\`created_at\` timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
			);
		`,
	);
	await db.execute(
		sql`
			CREATE TABLE \`notes\` (
				\`id\` bigint PRIMARY KEY AUTO_INCREMENT NOT NULL,
				\`content\` text NOT NULL,
				\`notable_id\` bigint,
				\`notable_type\` ENUM('user', 'post', 'comment') not null
			);
		`,
	);
});

/*
	[Find Many] One relation users+posts
*/

test('[Find Many] Get users with posts', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 3, content: 'Post3' },
	]);

	const usersWithPosts = await db.query.usersTable.findMany({
		with: {
			posts: true,
		},
	});

	expectTypeOf(usersWithPosts).toEqualTypeOf<{
		id: number;
		name: string;
		verified: boolean;
		invitedBy: number | null;
		posts: {
			id: number;
			content: string;
			ownerId: number | null;
			createdAt: Date;
		}[];
	}[]>();

	usersWithPosts.sort((a, b) => (a.id > b.id) ? 1 : -1);

	expect(usersWithPosts.length).eq(3);
	expect(usersWithPosts[0]?.posts.length).eq(1);
	expect(usersWithPosts[1]?.posts.length).eq(1);
	expect(usersWithPosts[2]?.posts.length).eq(1);

	expect(usersWithPosts[0]).toEqual({
		id: 1,
		name: 'Dan',
		verified: false,
		invitedBy: null,
		posts: [{ id: 1, ownerId: 1, content: 'Post1', createdAt: usersWithPosts[0]?.posts[0]?.createdAt }],
	});
	expect(usersWithPosts[1]).toEqual({
		id: 2,
		name: 'Andrew',
		verified: false,
		invitedBy: null,
		posts: [{ id: 2, ownerId: 2, content: 'Post2', createdAt: usersWithPosts[1]?.posts[0]?.createdAt }],
	});
	expect(usersWithPosts[2]).toEqual({
		id: 3,
		name: 'Alex',
		verified: false,
		invitedBy: null,
		posts: [{ id: 3, ownerId: 3, content: 'Post3', createdAt: usersWithPosts[2]?.posts[0]?.createdAt }],
	});
});

test('[Find Many] Get users with posts + limit posts', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.2' },
		{ ownerId: 1, content: 'Post1.3' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 2, content: 'Post2.1' },
		{ ownerId: 3, content: 'Post3' },
		{ ownerId: 3, content: 'Post3.1' },
	]);

	const usersWithPosts = await db.query.usersTable.findMany({
		with: {
			posts: {
				limit: 1,
			},
		},
	});

	expectTypeOf(usersWithPosts).toEqualTypeOf<{
		id: number;
		name: string;
		verified: boolean;
		invitedBy: number | null;
		posts: {
			id: number;
			content: string;
			ownerId: number | null;
			createdAt: Date;
		}[];
	}[]>();

	usersWithPosts.sort((a, b) => (a.id > b.id) ? 1 : -1);
	usersWithPosts[0]?.posts.sort((a, b) => (a.id > b.id) ? 1 : -1);
	usersWithPosts[1]?.posts.sort((a, b) => (a.id > b.id) ? 1 : -1);
	usersWithPosts[2]?.posts.sort((a, b) => (a.id > b.id) ? 1 : -1);

	expect(usersWithPosts.length).eq(3);
	expect(usersWithPosts[0]?.posts.length).eq(1);
	expect(usersWithPosts[1]?.posts.length).eq(1);
	expect(usersWithPosts[2]?.posts.length).eq(1);

	expect(usersWithPosts[0]).toEqual({
		id: 1,
		name: 'Dan',
		verified: false,
		invitedBy: null,
		posts: [{ id: 1, ownerId: 1, content: 'Post1', createdAt: usersWithPosts[0]?.posts[0]?.createdAt }],
	});
	expect(usersWithPosts[1]).toEqual({
		id: 2,
		name: 'Andrew',
		verified: false,
		invitedBy: null,
		posts: [{ id: 4, ownerId: 2, content: 'Post2', createdAt: usersWithPosts[1]?.posts[0]?.createdAt }],
	});
	expect(usersWithPosts[2]).toEqual({
		id: 3,
		name: 'Alex',
		verified: false,
		invitedBy: null,
		posts: [{ id: 6, ownerId: 3, content: 'Post3', createdAt: usersWithPosts[2]?.posts[0]?.createdAt }],
	});
});

test('[Find Many] Get users with posts + limit posts and users', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.2' },
		{ ownerId: 1, content: 'Post1.3' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 2, content: 'Post2.1' },
		{ ownerId: 3, content: 'Post3' },
		{ ownerId: 3, content: 'Post3.1' },
	]);

	const usersWithPosts = await db.query.usersTable.findMany({
		limit: 2,
		with: {
			posts: {
				limit: 1,
			},
		},
	});

	expectTypeOf(usersWithPosts).toEqualTypeOf<{
		id: number;
		name: string;
		verified: boolean;
		invitedBy: number | null;
		posts: {
			id: number;
			content: string;
			ownerId: number | null;
			createdAt: Date;
		}[];
	}[]>();

	usersWithPosts.sort((a, b) => (a.id > b.id) ? 1 : -1);
	usersWithPosts[0]?.posts.sort((a, b) => (a.id > b.id) ? 1 : -1);
	usersWithPosts[1]?.posts.sort((a, b) => (a.id > b.id) ? 1 : -1);

	expect(usersWithPosts.length).eq(2);
	expect(usersWithPosts[0]?.posts.length).eq(1);
	expect(usersWithPosts[1]?.posts.length).eq(1);

	expect(usersWithPosts[0]).toEqual({
		id: 1,
		name: 'Dan',
		verified: false,
		invitedBy: null,
		posts: [{ id: 1, ownerId: 1, content: 'Post1', createdAt: usersWithPosts[0]?.posts[0]?.createdAt }],
	});
	expect(usersWithPosts[1]).toEqual({
		id: 2,
		name: 'Andrew',
		verified: false,
		invitedBy: null,
		posts: [{ id: 4, ownerId: 2, content: 'Post2', createdAt: usersWithPosts[1]?.posts[0]?.createdAt }],
	});
});

test('[Find Many] Get users with posts + custom fields', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.2' },
		{ ownerId: 1, content: 'Post1.3' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 2, content: 'Post2.1' },
		{ ownerId: 3, content: 'Post3' },
		{ ownerId: 3, content: 'Post3.1' },
	]);

	const usersWithPosts = await db.query.usersTable.findMany({
		with: {
			posts: true,
		},
		extras: ({ name }) => ({
			lowerName: sql<string>`lower(${name})`.as('name_lower'),
		}),
	});

	expectTypeOf(usersWithPosts).toEqualTypeOf<{
		id: number;
		name: string;
		verified: boolean;
		invitedBy: number | null;
		lowerName: string;
		posts: {
			id: number;
			content: string;
			ownerId: number | null;
			createdAt: Date;
		}[];
	}[]>();

	usersWithPosts.sort((a, b) => (a.id > b.id) ? 1 : -1);
	usersWithPosts[0]?.posts.sort((a, b) => (a.id > b.id) ? 1 : -1);
	usersWithPosts[1]?.posts.sort((a, b) => (a.id > b.id) ? 1 : -1);
	usersWithPosts[2]?.posts.sort((a, b) => (a.id > b.id) ? 1 : -1);

	expect(usersWithPosts.length).toEqual(3);
	expect(usersWithPosts[0]?.posts.length).toEqual(3);
	expect(usersWithPosts[1]?.posts.length).toEqual(2);
	expect(usersWithPosts[2]?.posts.length).toEqual(2);

	expect(usersWithPosts[0]).toEqual({
		id: 1,
		name: 'Dan',
		verified: false,
		invitedBy: null,
		lowerName: 'dan',
		posts: [{ id: 1, ownerId: 1, content: 'Post1', createdAt: usersWithPosts[0]?.posts[0]?.createdAt }, {
			id: 2,
			ownerId: 1,
			content: 'Post1.2',
			createdAt: usersWithPosts[0]?.posts[1]?.createdAt,
		}, { id: 3, ownerId: 1, content: 'Post1.3', createdAt: usersWithPosts[0]?.posts[2]?.createdAt }],
	});
	expect(usersWithPosts[1]).toEqual({
		id: 2,
		name: 'Andrew',
		lowerName: 'andrew',
		verified: false,
		invitedBy: null,
		posts: [{ id: 4, ownerId: 2, content: 'Post2', createdAt: usersWithPosts[1]?.posts[0]?.createdAt }, {
			id: 5,
			ownerId: 2,
			content: 'Post2.1',
			createdAt: usersWithPosts[1]?.posts[1]?.createdAt,
		}],
	});
	expect(usersWithPosts[2]).toEqual({
		id: 3,
		name: 'Alex',
		lowerName: 'alex',
		verified: false,
		invitedBy: null,
		posts: [{ id: 6, ownerId: 3, content: 'Post3', createdAt: usersWithPosts[2]?.posts[0]?.createdAt }, {
			id: 7,
			ownerId: 3,
			content: 'Post3.1',
			createdAt: usersWithPosts[2]?.posts[1]?.createdAt,
		}],
	});
});

test('[Find Many] Get users with posts + custom fields + limits', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.2' },
		{ ownerId: 1, content: 'Post1.3' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 2, content: 'Post2.1' },
		{ ownerId: 3, content: 'Post3' },
		{ ownerId: 3, content: 'Post3.1' },
	]);

	const usersWithPosts = await db.query.usersTable.findMany({
		limit: 1,
		with: {
			posts: {
				limit: 1,
			},
		},
		extras: (usersTable, { sql }) => ({
			lowerName: sql<string>`lower(${usersTable.name})`.as('name_lower'),
		}),
	});

	expectTypeOf(usersWithPosts).toEqualTypeOf<{
		id: number;
		name: string;
		verified: boolean;
		invitedBy: number | null;
		lowerName: string;
		posts: {
			id: number;
			content: string;
			ownerId: number | null;
			createdAt: Date;
		}[];
	}[]>();

	expect(usersWithPosts.length).toEqual(1);
	expect(usersWithPosts[0]?.posts.length).toEqual(1);

	expect(usersWithPosts[0]).toEqual({
		id: 1,
		name: 'Dan',
		lowerName: 'dan',
		verified: false,
		invitedBy: null,
		posts: [{ id: 1, ownerId: 1, content: 'Post1', createdAt: usersWithPosts[0]?.posts[0]?.createdAt }],
	});
});

test('[Find Many] Get users with posts + orderBy', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: '1' },
		{ ownerId: 1, content: '2' },
		{ ownerId: 1, content: '3' },
		{ ownerId: 2, content: '4' },
		{ ownerId: 2, content: '5' },
		{ ownerId: 3, content: '6' },
		{ ownerId: 3, content: '7' },
	]);

	const usersWithPosts = await db.query.usersTable.findMany({
		with: {
			posts: {
				orderBy: (postsTable, { desc }) => [desc(postsTable.content)],
			},
		},
		orderBy: (usersTable, { desc }) => [desc(usersTable.id)],
	});

	expectTypeOf(usersWithPosts).toEqualTypeOf<{
		id: number;
		name: string;
		verified: boolean;
		invitedBy: number | null;
		posts: {
			id: number;
			content: string;
			ownerId: number | null;
			createdAt: Date;
		}[];
	}[]>();

	expect(usersWithPosts.length).eq(3);
	expect(usersWithPosts[0]?.posts.length).eq(2);
	expect(usersWithPosts[1]?.posts.length).eq(2);
	expect(usersWithPosts[2]?.posts.length).eq(3);

	expect(usersWithPosts[2]).toEqual({
		id: 1,
		name: 'Dan',
		verified: false,
		invitedBy: null,
		posts: [
			{
				id: 3,
				ownerId: 1,
				content: '3',
				createdAt: usersWithPosts[2]?.posts[2]?.createdAt,
			},
			{
				id: 2,
				ownerId: 1,
				content: '2',
				createdAt: usersWithPosts[2]?.posts[1]?.createdAt,
			},
			{
				id: 1,
				ownerId: 1,
				content: '1',
				createdAt: usersWithPosts[2]?.posts[0]?.createdAt,
			},
		],
	});
	expect(usersWithPosts[1]).toEqual({
		id: 2,
		name: 'Andrew',
		verified: false,
		invitedBy: null,
		posts: [{
			id: 5,
			ownerId: 2,
			content: '5',
			createdAt: usersWithPosts[1]?.posts[1]?.createdAt,
		}, { id: 4, ownerId: 2, content: '4', createdAt: usersWithPosts[1]?.posts[0]?.createdAt }],
	});
	expect(usersWithPosts[0]).toEqual({
		id: 3,
		name: 'Alex',
		verified: false,
		invitedBy: null,
		posts: [{
			id: 7,
			ownerId: 3,
			content: '7',
			createdAt: usersWithPosts[0]?.posts[1]?.createdAt,
		}, { id: 6, ownerId: 3, content: '6', createdAt: usersWithPosts[0]?.posts[0]?.createdAt }],
	});
});

test('[Find Many] Get users with posts + where', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.1' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 3, content: 'Post3' },
	]);

	const usersWithPosts = await db.query.usersTable.findMany({
		where: (({ id }, { eq }) => eq(id, 1)),
		with: {
			posts: {
				where: (({ id }, { eq }) => eq(id, 1)),
			},
		},
	});

	expectTypeOf(usersWithPosts).toEqualTypeOf<{
		id: number;
		name: string;
		verified: boolean;
		invitedBy: number | null;
		posts: {
			id: number;
			content: string;
			ownerId: number | null;
			createdAt: Date;
		}[];
	}[]>();

	expect(usersWithPosts.length).eq(1);
	expect(usersWithPosts[0]?.posts.length).eq(1);

	expect(usersWithPosts[0]).toEqual({
		id: 1,
		name: 'Dan',
		verified: false,
		invitedBy: null,
		posts: [{ id: 1, ownerId: 1, content: 'Post1', createdAt: usersWithPosts[0]?.posts[0]?.createdAt }],
	});
});

test('[Find Many] Get users with posts + where + partial', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.1' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 3, content: 'Post3' },
	]);

	const usersWithPosts = await db.query.usersTable.findMany({
		columns: {
			id: true,
			name: true,
		},
		with: {
			posts: {
				columns: {
					id: true,
					content: true,
				},
				where: (({ id }, { eq }) => eq(id, 1)),
			},
		},
		where: (({ id }, { eq }) => eq(id, 1)),
	});

	expectTypeOf(usersWithPosts).toEqualTypeOf<{
		id: number;
		name: string;
		posts: {
			id: number;
			content: string;
		}[];
	}[]>();

	expect(usersWithPosts.length).eq(1);
	expect(usersWithPosts[0]?.posts.length).eq(1);

	expect(usersWithPosts[0]).toEqual({
		id: 1,
		name: 'Dan',
		posts: [{ id: 1, content: 'Post1' }],
	});
});

test('[Find Many] Get users with posts + where + partial. Did not select posts id, but used it in where', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.1' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 3, content: 'Post3' },
	]);

	const usersWithPosts = await db.query.usersTable.findMany({
		columns: {
			id: true,
			name: true,
		},
		with: {
			posts: {
				columns: {
					id: true,
					content: true,
				},
				where: (({ id }, { eq }) => eq(id, 1)),
			},
		},
		where: (({ id }, { eq }) => eq(id, 1)),
	});

	expectTypeOf(usersWithPosts).toEqualTypeOf<{
		id: number;
		name: string;
		posts: {
			id: number;
			content: string;
		}[];
	}[]>();

	expect(usersWithPosts.length).eq(1);
	expect(usersWithPosts[0]?.posts.length).eq(1);

	expect(usersWithPosts[0]).toEqual({
		id: 1,
		name: 'Dan',
		posts: [{ id: 1, content: 'Post1' }],
	});
});

test('[Find Many] Get users with posts + where + partial(true + false)', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.1' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 3, content: 'Post3' },
	]);

	const usersWithPosts = await db.query.usersTable.findMany({
		columns: {
			id: true,
			name: false,
		},
		with: {
			posts: {
				columns: {
					id: true,
					content: false,
				},
				where: (({ id }, { eq }) => eq(id, 1)),
			},
		},
		where: (({ id }, { eq }) => eq(id, 1)),
	});

	expectTypeOf(usersWithPosts).toEqualTypeOf<{
		id: number;
		posts: {
			id: number;
		}[];
	}[]>();

	expect(usersWithPosts.length).eq(1);
	expect(usersWithPosts[0]?.posts.length).eq(1);

	expect(usersWithPosts[0]).toEqual({
		id: 1,
		posts: [{ id: 1 }],
	});
});

test('[Find Many] Get users with posts + where + partial(false)', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.1' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 3, content: 'Post3' },
	]);

	const usersWithPosts = await db.query.usersTable.findMany({
		columns: {
			name: false,
		},
		with: {
			posts: {
				columns: {
					content: false,
				},
				where: (({ id }, { eq }) => eq(id, 1)),
			},
		},
		where: (({ id }, { eq }) => eq(id, 1)),
	});

	expectTypeOf(usersWithPosts).toEqualTypeOf<{
		id: number;
		verified: boolean;
		invitedBy: number | null;
		posts: {
			id: number;
			ownerId: number | null;
			createdAt: Date;
		}[];
	}[]>();

	expect(usersWithPosts.length).eq(1);
	expect(usersWithPosts[0]?.posts.length).eq(1);

	expect(usersWithPosts[0]).toEqual({
		id: 1,
		verified: false,
		invitedBy: null,
		posts: [{ id: 1, ownerId: 1, createdAt: usersWithPosts[0]?.posts[0]?.createdAt }],
	});
});

test('[Find Many] Get users with posts in transaction', async () => {
	let usersWithPosts: {
		id: number;
		name: string;
		verified: boolean;
		invitedBy: number | null;
		posts: {
			id: number;
			content: string;
			ownerId: number | null;
			createdAt: Date;
		}[];
	}[] = [];

	await db.transaction(async (tx) => {
		await tx.insert(usersTable).values([
			{ id: 1, name: 'Dan' },
			{ id: 2, name: 'Andrew' },
			{ id: 3, name: 'Alex' },
		]);

		await tx.insert(postsTable).values([
			{ ownerId: 1, content: 'Post1' },
			{ ownerId: 1, content: 'Post1.1' },
			{ ownerId: 2, content: 'Post2' },
			{ ownerId: 3, content: 'Post3' },
		]);

		usersWithPosts = await tx.query.usersTable.findMany({
			where: (({ id }, { eq }) => eq(id, 1)),
			with: {
				posts: {
					where: (({ id }, { eq }) => eq(id, 1)),
				},
			},
		});
	});

	expectTypeOf(usersWithPosts).toEqualTypeOf<{
		id: number;
		name: string;
		verified: boolean;
		invitedBy: number | null;
		posts: {
			id: number;
			content: string;
			ownerId: number | null;
			createdAt: Date;
		}[];
	}[]>();

	expect(usersWithPosts.length).eq(1);
	expect(usersWithPosts[0]?.posts.length).eq(1);

	expect(usersWithPosts[0]).toEqual({
		id: 1,
		name: 'Dan',
		verified: false,
		invitedBy: null,
		posts: [{ id: 1, ownerId: 1, content: 'Post1', createdAt: usersWithPosts[0]?.posts[0]?.createdAt }],
	});
});

test('[Find Many] Get users with posts in rollbacked transaction', async () => {
	let usersWithPosts: {
		id: number;
		name: string;
		verified: boolean;
		invitedBy: number | null;
		posts: {
			id: number;
			content: string;
			ownerId: number | null;
			createdAt: Date;
		}[];
	}[] = [];

	await expect(db.transaction(async (tx) => {
		await tx.insert(usersTable).values([
			{ id: 1, name: 'Dan' },
			{ id: 2, name: 'Andrew' },
			{ id: 3, name: 'Alex' },
		]);

		await tx.insert(postsTable).values([
			{ ownerId: 1, content: 'Post1' },
			{ ownerId: 1, content: 'Post1.1' },
			{ ownerId: 2, content: 'Post2' },
			{ ownerId: 3, content: 'Post3' },
		]);

		tx.rollback();

		usersWithPosts = await tx.query.usersTable.findMany({
			where: (({ id }, { eq }) => eq(id, 1)),
			with: {
				posts: {
					where: (({ id }, { eq }) => eq(id, 1)),
				},
			},
		});
	})).rejects.toThrowError(new TransactionRollbackError());

	expectTypeOf(usersWithPosts).toEqualTypeOf<{
		id: number;
		name: string;
		verified: boolean;
		invitedBy: number | null;
		posts: {
			id: number;
			content: string;
			ownerId: number | null;
			createdAt: Date;
		}[];
	}[]>();

	expect(usersWithPosts.length).eq(0);
});

// select only custom
test('[Find Many] Get only custom fields', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(postsTable).values([
		{ id: 1, ownerId: 1, content: 'Post1' },
		{ id: 2, ownerId: 1, content: 'Post1.2' },
		{ id: 3, ownerId: 1, content: 'Post1.3' },
		{ id: 4, ownerId: 2, content: 'Post2' },
		{ id: 5, ownerId: 2, content: 'Post2.1' },
		{ id: 6, ownerId: 3, content: 'Post3' },
		{ id: 7, ownerId: 3, content: 'Post3.1' },
	]);

	const usersWithPosts = await db.query.usersTable.findMany({
		columns: {},
		with: {
			posts: {
				columns: {},
				extras: ({ content }) => ({
					lowerName: sql<string>`lower(${content})`.as('content_lower'),
				}),
			},
		},
		extras: ({ name }) => ({
			lowerName: sql<string>`lower(${name})`.as('name_lower'),
		}),
	});

	expectTypeOf(usersWithPosts).toEqualTypeOf<{
		lowerName: string;
		posts: {
			lowerName: string;
		}[];
	}[]>();

	expect(usersWithPosts.length).toEqual(3);
	expect(usersWithPosts[0]?.posts.length).toEqual(3);
	expect(usersWithPosts[1]?.posts.length).toEqual(2);
	expect(usersWithPosts[2]?.posts.length).toEqual(2);

	expect(usersWithPosts[0]?.lowerName).toEqual('dan');
	expect(usersWithPosts[1]?.lowerName).toEqual('andrew');
	expect(usersWithPosts[2]?.lowerName).toEqual('alex');

	expect(usersWithPosts[0]?.posts).toContainEqual({
		lowerName: 'post1',
	});

	expect(usersWithPosts[0]?.posts).toContainEqual({
		lowerName: 'post1.2',
	});

	expect(usersWithPosts[0]?.posts).toContainEqual({
		lowerName: 'post1.3',
	});

	expect(usersWithPosts[1]?.posts).toContainEqual({
		lowerName: 'post2',
	});

	expect(usersWithPosts[1]?.posts).toContainEqual({
		lowerName: 'post2.1',
	});

	expect(usersWithPosts[2]?.posts).toContainEqual({
		lowerName: 'post3',
	});

	expect(usersWithPosts[2]?.posts).toContainEqual({
		lowerName: 'post3.1',
	});
});

test('[Find Many] Get only custom fields + where', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.2' },
		{ ownerId: 1, content: 'Post1.3' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 2, content: 'Post2.1' },
		{ ownerId: 3, content: 'Post3' },
		{ ownerId: 3, content: 'Post3.1' },
	]);

	const usersWithPosts = await db.query.usersTable.findMany({
		columns: {},
		with: {
			posts: {
				columns: {},
				where: gte(postsTable.id, 2),
				extras: ({ content }) => ({
					lowerName: sql<string>`lower(${content})`.as('content_lower'),
				}),
			},
		},
		where: eq(usersTable.id, 1),
		extras: ({ name }) => ({
			lowerName: sql<string>`lower(${name})`.as('name_lower'),
		}),
	});

	expectTypeOf(usersWithPosts).toEqualTypeOf<{
		lowerName: string;
		posts: {
			lowerName: string;
		}[];
	}[]>();

	expect(usersWithPosts.length).toEqual(1);
	expect(usersWithPosts[0]?.posts.length).toEqual(2);

	expect(usersWithPosts).toContainEqual({
		lowerName: 'dan',
		posts: [{ lowerName: 'post1.2' }, { lowerName: 'post1.3' }],
	});
});

test('[Find Many] Get only custom fields + where + limit', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.2' },
		{ ownerId: 1, content: 'Post1.3' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 2, content: 'Post2.1' },
		{ ownerId: 3, content: 'Post3' },
		{ ownerId: 3, content: 'Post3.1' },
	]);

	const usersWithPosts = await db.query.usersTable.findMany({
		columns: {},
		with: {
			posts: {
				columns: {},
				where: gte(postsTable.id, 2),
				limit: 1,
				extras: ({ content }) => ({
					lowerName: sql<string>`lower(${content})`.as('content_lower'),
				}),
			},
		},
		where: eq(usersTable.id, 1),
		extras: ({ name }) => ({
			lowerName: sql<string>`lower(${name})`.as('name_lower'),
		}),
	});

	expectTypeOf(usersWithPosts).toEqualTypeOf<{
		lowerName: string;
		posts: {
			lowerName: string;
		}[];
	}[]>();

	expect(usersWithPosts.length).toEqual(1);
	expect(usersWithPosts[0]?.posts.length).toEqual(1);

	expect(usersWithPosts).toContainEqual({
		lowerName: 'dan',
		posts: [{ lowerName: 'post1.2' }],
	});
});

test('[Find Many] Get only custom fields + where + orderBy', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.2' },
		{ ownerId: 1, content: 'Post1.3' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 2, content: 'Post2.1' },
		{ ownerId: 3, content: 'Post3' },
		{ ownerId: 3, content: 'Post3.1' },
	]);

	const usersWithPosts = await db.query.usersTable.findMany({
		columns: {},
		with: {
			posts: {
				columns: {},
				where: gte(postsTable.id, 2),
				orderBy: [desc(postsTable.id)],
				extras: ({ content }) => ({
					lowerName: sql<string>`lower(${content})`.as('content_lower'),
				}),
			},
		},
		where: eq(usersTable.id, 1),
		extras: ({ name }) => ({
			lowerName: sql<string>`lower(${name})`.as('name_lower'),
		}),
	});

	expectTypeOf(usersWithPosts).toEqualTypeOf<{
		lowerName: string;
		posts: {
			lowerName: string;
		}[];
	}[]>();

	expect(usersWithPosts.length).toEqual(1);
	expect(usersWithPosts[0]?.posts.length).toEqual(2);

	expect(usersWithPosts).toContainEqual({
		lowerName: 'dan',
		posts: [{ lowerName: 'post1.3' }, { lowerName: 'post1.2' }],
	});
});

// select only custom find one
test('[Find One] Get only custom fields', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.2' },
		{ ownerId: 1, content: 'Post1.3' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 2, content: 'Post2.1' },
		{ ownerId: 3, content: 'Post3' },
		{ ownerId: 3, content: 'Post3.1' },
	]);

	const usersWithPosts = await db.query.usersTable.findFirst({
		columns: {},
		with: {
			posts: {
				columns: {},
				extras: ({ content }) => ({
					lowerName: sql<string>`lower(${content})`.as('content_lower'),
				}),
			},
		},
		extras: ({ name }) => ({
			lowerName: sql<string>`lower(${name})`.as('name_lower'),
		}),
	});

	expectTypeOf(usersWithPosts).toEqualTypeOf<
		{
			lowerName: string;
			posts: {
				lowerName: string;
			}[];
		} | undefined
	>();

	expect(usersWithPosts?.posts.length).toEqual(3);

	expect(usersWithPosts?.lowerName).toEqual('dan');

	expect(usersWithPosts?.posts).toContainEqual({
		lowerName: 'post1',
	});

	expect(usersWithPosts?.posts).toContainEqual({
		lowerName: 'post1.2',
	});

	expect(usersWithPosts?.posts).toContainEqual({
		lowerName: 'post1.3',
	});
});

test('[Find One] Get only custom fields + where', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.2' },
		{ ownerId: 1, content: 'Post1.3' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 2, content: 'Post2.1' },
		{ ownerId: 3, content: 'Post3' },
		{ ownerId: 3, content: 'Post3.1' },
	]);

	const usersWithPosts = await db.query.usersTable.findFirst({
		columns: {},
		with: {
			posts: {
				columns: {},
				where: gte(postsTable.id, 2),
				extras: ({ content }) => ({
					lowerName: sql<string>`lower(${content})`.as('content_lower'),
				}),
			},
		},
		where: eq(usersTable.id, 1),
		extras: ({ name }) => ({
			lowerName: sql<string>`lower(${name})`.as('name_lower'),
		}),
	});

	expectTypeOf(usersWithPosts).toEqualTypeOf<
		{
			lowerName: string;
			posts: {
				lowerName: string;
			}[];
		} | undefined
	>();

	expect(usersWithPosts?.posts.length).toEqual(2);

	expect(usersWithPosts).toEqual({
		lowerName: 'dan',
		posts: [{ lowerName: 'post1.2' }, { lowerName: 'post1.3' }],
	});
});

test('[Find One] Get only custom fields + where + limit', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.2' },
		{ ownerId: 1, content: 'Post1.3' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 2, content: 'Post2.1' },
		{ ownerId: 3, content: 'Post3' },
		{ ownerId: 3, content: 'Post3.1' },
	]);

	const usersWithPosts = await db.query.usersTable.findFirst({
		columns: {},
		with: {
			posts: {
				columns: {},
				where: gte(postsTable.id, 2),
				limit: 1,
				extras: ({ content }) => ({
					lowerName: sql<string>`lower(${content})`.as('content_lower'),
				}),
			},
		},
		where: eq(usersTable.id, 1),
		extras: ({ name }) => ({
			lowerName: sql<string>`lower(${name})`.as('name_lower'),
		}),
	});

	expectTypeOf(usersWithPosts).toEqualTypeOf<
		{
			lowerName: string;
			posts: {
				lowerName: string;
			}[];
		} | undefined
	>();

	expect(usersWithPosts?.posts.length).toEqual(1);

	expect(usersWithPosts).toEqual({
		lowerName: 'dan',
		posts: [{ lowerName: 'post1.2' }],
	});
});

test('[Find One] Get only custom fields + where + orderBy', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.2' },
		{ ownerId: 1, content: 'Post1.3' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 2, content: 'Post2.1' },
		{ ownerId: 3, content: 'Post3' },
		{ ownerId: 3, content: 'Post3.1' },
	]);

	const usersWithPosts = await db.query.usersTable.findFirst({
		columns: {},
		with: {
			posts: {
				columns: {},
				where: gte(postsTable.id, 2),
				orderBy: [desc(postsTable.id)],
				extras: ({ content }) => ({
					lowerName: sql<string>`lower(${content})`.as('content_lower'),
				}),
			},
		},
		where: eq(usersTable.id, 1),
		extras: ({ name }) => ({
			lowerName: sql<string>`lower(${name})`.as('name_lower'),
		}),
	});

	expectTypeOf(usersWithPosts).toEqualTypeOf<
		{
			lowerName: string;
			posts: {
				lowerName: string;
			}[];
		} | undefined
	>();

	expect(usersWithPosts?.posts.length).toEqual(2);

	expect(usersWithPosts).toEqual({
		lowerName: 'dan',
		posts: [{ lowerName: 'post1.3' }, { lowerName: 'post1.2' }],
	});
});

// columns {}
test('[Find Many] Get select {}', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await expect(async () =>
		await db.query.usersTable.findMany({
			columns: {},
		})
	).rejects.toThrow(DrizzleError);
});

// columns {}
test('[Find One] Get select {}', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await expect(async () =>
		await db.query.usersTable.findFirst({
			columns: {},
		})
	).rejects.toThrow(DrizzleError);
});

// deep select {}
test('[Find Many] Get deep select {}', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 3, content: 'Post3' },
	]);

	await expect(async () =>
		await db.query.usersTable.findMany({
			columns: {},
			with: {
				posts: {
					columns: {},
				},
			},
		})
	).rejects.toThrow(DrizzleError);
});

// deep select {}
test('[Find One] Get deep select {}', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 3, content: 'Post3' },
	]);

	await expect(async () =>
		await db.query.usersTable.findFirst({
			columns: {},
			with: {
				posts: {
					columns: {},
				},
			},
		})
	).rejects.toThrow(DrizzleError);
});

/*
	Prepared statements for users+posts
*/
test('[Find Many] Get users with posts + prepared limit', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.2' },
		{ ownerId: 1, content: 'Post1.3' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 2, content: 'Post2.1' },
		{ ownerId: 3, content: 'Post3' },
		{ ownerId: 3, content: 'Post3.1' },
	]);

	const prepared = db.query.usersTable.findMany({
		with: {
			posts: {
				limit: placeholder('limit'),
			},
		},
	}).prepare();

	const usersWithPosts = await prepared.execute({ limit: 1 });

	expectTypeOf(usersWithPosts).toEqualTypeOf<{
		id: number;
		name: string;
		verified: boolean;
		invitedBy: number | null;
		posts: {
			id: number;
			content: string;
			ownerId: number | null;
			createdAt: Date;
		}[];
	}[]>();

	expect(usersWithPosts.length).eq(3);
	expect(usersWithPosts[0]?.posts.length).eq(1);
	expect(usersWithPosts[1]?.posts.length).eq(1);
	expect(usersWithPosts[2]?.posts.length).eq(1);

	expect(usersWithPosts).toContainEqual({
		id: 1,
		name: 'Dan',
		verified: false,
		invitedBy: null,
		posts: [{ id: 1, ownerId: 1, content: 'Post1', createdAt: usersWithPosts[0]?.posts[0]?.createdAt }],
	});
	expect(usersWithPosts).toContainEqual({
		id: 2,
		name: 'Andrew',
		verified: false,
		invitedBy: null,
		posts: [{ id: 4, ownerId: 2, content: 'Post2', createdAt: usersWithPosts[1]?.posts[0]?.createdAt }],
	});
	expect(usersWithPosts).toContainEqual({
		id: 3,
		name: 'Alex',
		verified: false,
		invitedBy: null,
		posts: [{ id: 6, ownerId: 3, content: 'Post3', createdAt: usersWithPosts[2]?.posts[0]?.createdAt }],
	});
});

test('[Find Many] Get users with posts + prepared limit + offset', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.2' },
		{ ownerId: 1, content: 'Post1.3' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 2, content: 'Post2.1' },
		{ ownerId: 3, content: 'Post3' },
		{ ownerId: 3, content: 'Post3.1' },
	]);

	const prepared = db.query.usersTable.findMany({
		limit: placeholder('uLimit'),
		offset: placeholder('uOffset'),
		with: {
			posts: {
				limit: placeholder('pLimit'),
			},
		},
	}).prepare();

	const usersWithPosts = await prepared.execute({ pLimit: 1, uLimit: 3, uOffset: 1 });

	expectTypeOf(usersWithPosts).toEqualTypeOf<{
		id: number;
		name: string;
		verified: boolean;
		invitedBy: number | null;
		posts: {
			id: number;
			content: string;
			ownerId: number | null;
			createdAt: Date;
		}[];
	}[]>();

	expect(usersWithPosts.length).eq(2);
	expect(usersWithPosts[0]?.posts.length).eq(1);
	expect(usersWithPosts[1]?.posts.length).eq(1);

	expect(usersWithPosts).toContainEqual({
		id: 2,
		name: 'Andrew',
		verified: false,
		invitedBy: null,
		posts: [{ id: 4, ownerId: 2, content: 'Post2', createdAt: usersWithPosts[0]?.posts[0]?.createdAt }],
	});
	expect(usersWithPosts).toContainEqual({
		id: 3,
		name: 'Alex',
		verified: false,
		invitedBy: null,
		posts: [{ id: 6, ownerId: 3, content: 'Post3', createdAt: usersWithPosts[1]?.posts[0]?.createdAt }],
	});
});

test('[Find Many] Get users with posts + prepared where', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.1' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 3, content: 'Post3' },
	]);

	const prepared = db.query.usersTable.findMany({
		where: (({ id }, { eq }) => eq(id, placeholder('id'))),
		with: {
			posts: {
				where: (({ id }, { eq }) => eq(id, 1)),
			},
		},
	}).prepare();

	const usersWithPosts = await prepared.execute({ id: 1 });

	expectTypeOf(usersWithPosts).toEqualTypeOf<{
		id: number;
		name: string;
		verified: boolean;
		invitedBy: number | null;
		posts: {
			id: number;
			content: string;
			ownerId: number | null;
			createdAt: Date;
		}[];
	}[]>();

	expect(usersWithPosts.length).eq(1);
	expect(usersWithPosts[0]?.posts.length).eq(1);

	expect(usersWithPosts[0]).toEqual({
		id: 1,
		name: 'Dan',
		verified: false,
		invitedBy: null,
		posts: [{ id: 1, ownerId: 1, content: 'Post1', createdAt: usersWithPosts[0]?.posts[0]?.createdAt }],
	});
});

test('[Find Many] Get users with posts + prepared + limit + offset + where', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.2' },
		{ ownerId: 1, content: 'Post1.3' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 2, content: 'Post2.1' },
		{ ownerId: 3, content: 'Post3' },
		{ ownerId: 3, content: 'Post3.1' },
	]);

	const prepared = db.query.usersTable.findMany({
		limit: placeholder('uLimit'),
		offset: placeholder('uOffset'),
		where: (({ id }, { eq, or }) => or(eq(id, placeholder('id')), eq(id, 3))),
		with: {
			posts: {
				where: (({ id }, { eq }) => eq(id, placeholder('pid'))),
				limit: placeholder('pLimit'),
			},
		},
	}).prepare();

	const usersWithPosts = await prepared.execute({ pLimit: 1, uLimit: 3, uOffset: 1, id: 2, pid: 6 });

	expectTypeOf(usersWithPosts).toEqualTypeOf<{
		id: number;
		name: string;
		verified: boolean;
		invitedBy: number | null;
		posts: {
			id: number;
			content: string;
			ownerId: number | null;
			createdAt: Date;
		}[];
	}[]>();

	expect(usersWithPosts.length).eq(1);
	expect(usersWithPosts[0]?.posts.length).eq(1);

	expect(usersWithPosts).toContainEqual({
		id: 3,
		name: 'Alex',
		verified: false,
		invitedBy: null,
		posts: [{ id: 6, ownerId: 3, content: 'Post3', createdAt: usersWithPosts[0]?.posts[0]?.createdAt }],
	});
});

/*
	[Find One] One relation users+posts
*/

test('[Find One] Get users with posts', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 3, content: 'Post3' },
	]);

	const usersWithPosts = await db.query.usersTable.findFirst({
		with: {
			posts: true,
		},
	});

	expectTypeOf(usersWithPosts).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: boolean;
			invitedBy: number | null;
			posts: {
				id: number;
				content: string;
				ownerId: number | null;
				createdAt: Date;
			}[];
		} | undefined
	>();

	expect(usersWithPosts!.posts.length).eq(1);

	expect(usersWithPosts).toEqual({
		id: 1,
		name: 'Dan',
		verified: false,
		invitedBy: null,
		posts: [{ id: 1, ownerId: 1, content: 'Post1', createdAt: usersWithPosts?.posts[0]?.createdAt }],
	});
});

test('[Find One] Get users with posts + limit posts', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.2' },
		{ ownerId: 1, content: 'Post1.3' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 2, content: 'Post2.1' },
		{ ownerId: 3, content: 'Post3' },
		{ ownerId: 3, content: 'Post3.1' },
	]);

	const usersWithPosts = await db.query.usersTable.findFirst({
		with: {
			posts: {
				limit: 1,
			},
		},
	});

	expectTypeOf(usersWithPosts).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: boolean;
			invitedBy: number | null;
			posts: {
				id: number;
				content: string;
				ownerId: number | null;
				createdAt: Date;
			}[];
		} | undefined
	>();

	expect(usersWithPosts!.posts.length).eq(1);

	expect(usersWithPosts).toEqual({
		id: 1,
		name: 'Dan',
		verified: false,
		invitedBy: null,
		posts: [{ id: 1, ownerId: 1, content: 'Post1', createdAt: usersWithPosts?.posts[0]?.createdAt }],
	});
});

test('[Find One] Get users with posts no results found', async () => {
	const usersWithPosts = await db.query.usersTable.findFirst({
		with: {
			posts: {
				limit: 1,
			},
		},
	});

	expectTypeOf(usersWithPosts).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: boolean;
			invitedBy: number | null;
			posts: {
				id: number;
				content: string;
				ownerId: number | null;
				createdAt: Date;
			}[];
		} | undefined
	>();

	expect(usersWithPosts).toBeUndefined();
});

test('[Find One] Get users with posts + limit posts and users', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.2' },
		{ ownerId: 1, content: 'Post1.3' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 2, content: 'Post2.1' },
		{ ownerId: 3, content: 'Post3' },
		{ ownerId: 3, content: 'Post3.1' },
	]);

	const usersWithPosts = await db.query.usersTable.findFirst({
		with: {
			posts: {
				limit: 1,
			},
		},
	});

	expectTypeOf(usersWithPosts).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: boolean;
			invitedBy: number | null;
			posts: {
				id: number;
				content: string;
				ownerId: number | null;
				createdAt: Date;
			}[];
		} | undefined
	>();

	expect(usersWithPosts!.posts.length).eq(1);

	expect(usersWithPosts).toEqual({
		id: 1,
		name: 'Dan',
		verified: false,
		invitedBy: null,
		posts: [{ id: 1, ownerId: 1, content: 'Post1', createdAt: usersWithPosts?.posts[0]?.createdAt }],
	});
});

test('[Find One] Get users with posts + custom fields', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.2' },
		{ ownerId: 1, content: 'Post1.3' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 2, content: 'Post2.1' },
		{ ownerId: 3, content: 'Post3' },
		{ ownerId: 3, content: 'Post3.1' },
	]);

	const usersWithPosts = await db.query.usersTable.findFirst({
		with: {
			posts: true,
		},
		extras: ({ name }) => ({
			lowerName: sql<string>`lower(${name})`.as('name_lower'),
		}),
	});

	expectTypeOf(usersWithPosts).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: boolean;
			invitedBy: number | null;
			lowerName: string;
			posts: {
				id: number;
				content: string;
				ownerId: number | null;
				createdAt: Date;
			}[];
		} | undefined
	>();

	expect(usersWithPosts!.posts.length).toEqual(3);

	expect(usersWithPosts?.lowerName).toEqual('dan');
	expect(usersWithPosts?.id).toEqual(1);
	expect(usersWithPosts?.verified).toEqual(false);
	expect(usersWithPosts?.invitedBy).toEqual(null);
	expect(usersWithPosts?.name).toEqual('Dan');

	expect(usersWithPosts?.posts).toContainEqual({
		id: 1,
		ownerId: 1,
		content: 'Post1',
		createdAt: usersWithPosts?.posts[0]?.createdAt,
	});

	expect(usersWithPosts?.posts).toContainEqual({
		id: 2,
		ownerId: 1,
		content: 'Post1.2',
		createdAt: usersWithPosts?.posts[1]?.createdAt,
	});

	expect(usersWithPosts?.posts).toContainEqual({
		id: 3,
		ownerId: 1,
		content: 'Post1.3',
		createdAt: usersWithPosts?.posts[2]?.createdAt,
	});
});

test('[Find One] Get users with posts + custom fields + limits', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.2' },
		{ ownerId: 1, content: 'Post1.3' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 2, content: 'Post2.1' },
		{ ownerId: 3, content: 'Post3' },
		{ ownerId: 3, content: 'Post3.1' },
	]);

	const usersWithPosts = await db.query.usersTable.findFirst({
		with: {
			posts: {
				limit: 1,
			},
		},
		extras: (usersTable, { sql }) => ({
			lowerName: sql<string>`lower(${usersTable.name})`.as('name_lower'),
		}),
	});

	expectTypeOf(usersWithPosts).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: boolean;
			invitedBy: number | null;
			lowerName: string;
			posts: {
				id: number;
				content: string;
				ownerId: number | null;
				createdAt: Date;
			}[];
		} | undefined
	>();

	expect(usersWithPosts!.posts.length).toEqual(1);

	expect(usersWithPosts).toEqual({
		id: 1,
		name: 'Dan',
		lowerName: 'dan',
		verified: false,
		invitedBy: null,
		posts: [{ id: 1, ownerId: 1, content: 'Post1', createdAt: usersWithPosts?.posts[0]?.createdAt }],
	});
});

test('[Find One] Get users with posts + orderBy', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: '1' },
		{ ownerId: 1, content: '2' },
		{ ownerId: 1, content: '3' },
		{ ownerId: 2, content: '4' },
		{ ownerId: 2, content: '5' },
		{ ownerId: 3, content: '6' },
		{ ownerId: 3, content: '7' },
	]);

	const usersWithPosts = await db.query.usersTable.findFirst({
		with: {
			posts: {
				orderBy: (postsTable, { desc }) => [desc(postsTable.content)],
			},
		},
		orderBy: (usersTable, { desc }) => [desc(usersTable.id)],
	});

	expectTypeOf(usersWithPosts).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: boolean;
			invitedBy: number | null;
			posts: {
				id: number;
				content: string;
				ownerId: number | null;
				createdAt: Date;
			}[];
		} | undefined
	>();

	expect(usersWithPosts!.posts.length).eq(2);

	expect(usersWithPosts).toEqual({
		id: 3,
		name: 'Alex',
		verified: false,
		invitedBy: null,
		posts: [{
			id: 7,
			ownerId: 3,
			content: '7',
			createdAt: usersWithPosts?.posts[1]?.createdAt,
		}, { id: 6, ownerId: 3, content: '6', createdAt: usersWithPosts?.posts[0]?.createdAt }],
	});
});

test('[Find One] Get users with posts + where', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.1' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 3, content: 'Post3' },
	]);

	const usersWithPosts = await db.query.usersTable.findFirst({
		where: (({ id }, { eq }) => eq(id, 1)),
		with: {
			posts: {
				where: (({ id }, { eq }) => eq(id, 1)),
			},
		},
	});

	expectTypeOf(usersWithPosts).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: boolean;
			invitedBy: number | null;
			posts: {
				id: number;
				content: string;
				ownerId: number | null;
				createdAt: Date;
			}[];
		} | undefined
	>();

	expect(usersWithPosts!.posts.length).eq(1);

	expect(usersWithPosts).toEqual({
		id: 1,
		name: 'Dan',
		verified: false,
		invitedBy: null,
		posts: [{ id: 1, ownerId: 1, content: 'Post1', createdAt: usersWithPosts?.posts[0]?.createdAt }],
	});
});

test('[Find One] Get users with posts + where + partial', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.1' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 3, content: 'Post3' },
	]);

	const usersWithPosts = await db.query.usersTable.findFirst({
		columns: {
			id: true,
			name: true,
		},
		with: {
			posts: {
				columns: {
					id: true,
					content: true,
				},
				where: (({ id }, { eq }) => eq(id, 1)),
			},
		},
		where: (({ id }, { eq }) => eq(id, 1)),
	});

	expectTypeOf(usersWithPosts).toEqualTypeOf<
		{
			id: number;
			name: string;
			posts: {
				id: number;
				content: string;
			}[];
		} | undefined
	>();

	expect(usersWithPosts!.posts.length).eq(1);

	expect(usersWithPosts).toEqual({
		id: 1,
		name: 'Dan',
		posts: [{ id: 1, content: 'Post1' }],
	});
});

test('[Find One] Get users with posts + where + partial. Did not select posts id, but used it in where', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.1' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 3, content: 'Post3' },
	]);

	const usersWithPosts = await db.query.usersTable.findFirst({
		columns: {
			id: true,
			name: true,
		},
		with: {
			posts: {
				columns: {
					id: true,
					content: true,
				},
				where: (({ id }, { eq }) => eq(id, 1)),
			},
		},
		where: (({ id }, { eq }) => eq(id, 1)),
	});

	expectTypeOf(usersWithPosts).toEqualTypeOf<
		{
			id: number;
			name: string;
			posts: {
				id: number;
				content: string;
			}[];
		} | undefined
	>();

	expect(usersWithPosts!.posts.length).eq(1);

	expect(usersWithPosts).toEqual({
		id: 1,
		name: 'Dan',
		posts: [{ id: 1, content: 'Post1' }],
	});
});

test('[Find One] Get users with posts + where + partial(true + false)', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.1' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 3, content: 'Post3' },
	]);

	const usersWithPosts = await db.query.usersTable.findFirst({
		columns: {
			id: true,
			name: false,
		},
		with: {
			posts: {
				columns: {
					id: true,
					content: false,
				},
				where: (({ id }, { eq }) => eq(id, 1)),
			},
		},
		where: (({ id }, { eq }) => eq(id, 1)),
	});

	expectTypeOf(usersWithPosts).toEqualTypeOf<
		{
			id: number;
			posts: {
				id: number;
			}[];
		} | undefined
	>();

	expect(usersWithPosts!.posts.length).eq(1);

	expect(usersWithPosts).toEqual({
		id: 1,
		posts: [{ id: 1 }],
	});
});

test('[Find One] Get users with posts + where + partial(false)', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.1' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 3, content: 'Post3' },
	]);

	const usersWithPosts = await db.query.usersTable.findFirst({
		columns: {
			name: false,
		},
		with: {
			posts: {
				columns: {
					content: false,
				},
				where: (({ id }, { eq }) => eq(id, 1)),
			},
		},
		where: (({ id }, { eq }) => eq(id, 1)),
	});

	expectTypeOf(usersWithPosts).toEqualTypeOf<
		{
			id: number;
			verified: boolean;
			invitedBy: number | null;
			posts: {
				id: number;
				ownerId: number | null;
				createdAt: Date;
			}[];
		} | undefined
	>();

	expect(usersWithPosts!.posts.length).eq(1);

	expect(usersWithPosts).toEqual({
		id: 1,
		verified: false,
		invitedBy: null,
		posts: [{ id: 1, ownerId: 1, createdAt: usersWithPosts?.posts[0]?.createdAt }],
	});
});

/*
	One relation users+users. Self referencing
*/

test('Get user with invitee', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex', invitedBy: 1 },
		{ id: 4, name: 'John', invitedBy: 2 },
	]);

	const usersWithInvitee = await db.query.usersTable.findMany({
		with: {
			invitee: true,
		},
	});

	expectTypeOf(usersWithInvitee).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: boolean;
			invitedBy: number | null;
			invitee: {
				id: number;
				name: string;
				verified: boolean;
				invitedBy: number | null;
			} | null;
		}[]
	>();

	usersWithInvitee.sort((a, b) => (a.id > b.id) ? 1 : -1);

	expect(usersWithInvitee.length).eq(4);
	expect(usersWithInvitee[0]?.invitee).toBeNull();
	expect(usersWithInvitee[1]?.invitee).toBeNull();
	expect(usersWithInvitee[2]?.invitee).not.toBeNull();
	expect(usersWithInvitee[3]?.invitee).not.toBeNull();

	expect(usersWithInvitee[0]).toEqual({
		id: 1,
		name: 'Dan',
		verified: false,
		invitedBy: null,
		invitee: null,
	});
	expect(usersWithInvitee[1]).toEqual({
		id: 2,
		name: 'Andrew',
		verified: false,
		invitedBy: null,
		invitee: null,
	});
	expect(usersWithInvitee[2]).toEqual({
		id: 3,
		name: 'Alex',
		verified: false,
		invitedBy: 1,
		invitee: { id: 1, name: 'Dan', verified: false, invitedBy: null },
	});
	expect(usersWithInvitee[3]).toEqual({
		id: 4,
		name: 'John',
		verified: false,
		invitedBy: 2,
		invitee: { id: 2, name: 'Andrew', verified: false, invitedBy: null },
	});
});

test('Get user + limit with invitee', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew', invitedBy: 1 },
		{ id: 3, name: 'Alex', invitedBy: 1 },
		{ id: 4, name: 'John', invitedBy: 2 },
	]);

	const usersWithInvitee = await db.query.usersTable.findMany({
		with: {
			invitee: true,
		},
		limit: 2,
	});

	expectTypeOf(usersWithInvitee).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: boolean;
			invitedBy: number | null;
			invitee: {
				id: number;
				name: string;
				verified: boolean;
				invitedBy: number | null;
			} | null;
		}[]
	>();

	usersWithInvitee.sort((a, b) => (a.id > b.id) ? 1 : -1);

	expect(usersWithInvitee.length).eq(2);
	expect(usersWithInvitee[0]?.invitee).toBeNull();
	expect(usersWithInvitee[1]?.invitee).not.toBeNull();

	expect(usersWithInvitee[0]).toEqual({
		id: 1,
		name: 'Dan',
		verified: false,
		invitedBy: null,
		invitee: null,
	});
	expect(usersWithInvitee[1]).toEqual({
		id: 2,
		name: 'Andrew',
		verified: false,
		invitedBy: 1,
		invitee: { id: 1, name: 'Dan', verified: false, invitedBy: null },
	});
});

test('Get user with invitee and custom fields', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex', invitedBy: 1 },
		{ id: 4, name: 'John', invitedBy: 2 },
	]);

	const usersWithInvitee = await db.query.usersTable.findMany({
		extras: (users, { sql }) => ({ lower: sql<string>`lower(${users.name})`.as('lower_name') }),
		with: {
			invitee: {
				extras: (invitee, { sql }) => ({ lower: sql<string>`lower(${invitee.name})`.as('lower_name') }),
			},
		},
	});

	expectTypeOf(usersWithInvitee).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: boolean;
			lower: string;
			invitedBy: number | null;
			invitee: {
				id: number;
				name: string;
				verified: boolean;
				lower: string;
				invitedBy: number | null;
			} | null;
		}[]
	>();

	usersWithInvitee.sort((a, b) => (a.id > b.id) ? 1 : -1);

	expect(usersWithInvitee.length).eq(4);
	expect(usersWithInvitee[0]?.invitee).toBeNull();
	expect(usersWithInvitee[1]?.invitee).toBeNull();
	expect(usersWithInvitee[2]?.invitee).not.toBeNull();
	expect(usersWithInvitee[3]?.invitee).not.toBeNull();

	expect(usersWithInvitee[0]).toEqual({
		id: 1,
		name: 'Dan',
		lower: 'dan',
		verified: false,
		invitedBy: null,
		invitee: null,
	});
	expect(usersWithInvitee[1]).toEqual({
		id: 2,
		name: 'Andrew',
		lower: 'andrew',
		verified: false,
		invitedBy: null,
		invitee: null,
	});
	expect(usersWithInvitee[2]).toEqual({
		id: 3,
		name: 'Alex',
		lower: 'alex',
		verified: false,
		invitedBy: 1,
		invitee: { id: 1, name: 'Dan', lower: 'dan', verified: false, invitedBy: null },
	});
	expect(usersWithInvitee[3]).toEqual({
		id: 4,
		name: 'John',
		lower: 'john',
		verified: false,
		invitedBy: 2,
		invitee: { id: 2, name: 'Andrew', lower: 'andrew', verified: false, invitedBy: null },
	});
});

test('Get user with invitee and custom fields + limits', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex', invitedBy: 1 },
		{ id: 4, name: 'John', invitedBy: 2 },
	]);

	const usersWithInvitee = await db.query.usersTable.findMany({
		extras: (users, { sql }) => ({ lower: sql<string>`lower(${users.name})`.as('lower_name') }),
		limit: 3,
		with: {
			invitee: {
				extras: (invitee, { sql }) => ({ lower: sql<string>`lower(${invitee.name})`.as('lower_name') }),
			},
		},
	});

	expectTypeOf(usersWithInvitee).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: boolean;
			lower: string;
			invitedBy: number | null;
			invitee: {
				id: number;
				name: string;
				verified: boolean;
				lower: string;
				invitedBy: number | null;
			} | null;
		}[]
	>();

	usersWithInvitee.sort((a, b) => (a.id > b.id) ? 1 : -1);

	expect(usersWithInvitee.length).eq(3);
	expect(usersWithInvitee[0]?.invitee).toBeNull();
	expect(usersWithInvitee[1]?.invitee).toBeNull();
	expect(usersWithInvitee[2]?.invitee).not.toBeNull();

	expect(usersWithInvitee[0]).toEqual({
		id: 1,
		name: 'Dan',
		lower: 'dan',
		verified: false,
		invitedBy: null,
		invitee: null,
	});
	expect(usersWithInvitee[1]).toEqual({
		id: 2,
		name: 'Andrew',
		lower: 'andrew',
		verified: false,
		invitedBy: null,
		invitee: null,
	});
	expect(usersWithInvitee[2]).toEqual({
		id: 3,
		name: 'Alex',
		lower: 'alex',
		verified: false,
		invitedBy: 1,
		invitee: { id: 1, name: 'Dan', lower: 'dan', verified: false, invitedBy: null },
	});
});

test('Get user with invitee + order by', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex', invitedBy: 1 },
		{ id: 4, name: 'John', invitedBy: 2 },
	]);

	const usersWithInvitee = await db.query.usersTable.findMany({
		orderBy: (users, { desc }) => [desc(users.id)],
		with: {
			invitee: true,
		},
	});

	expectTypeOf(usersWithInvitee).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: boolean;
			invitedBy: number | null;
			invitee: {
				id: number;
				name: string;
				verified: boolean;
				invitedBy: number | null;
			} | null;
		}[]
	>();

	expect(usersWithInvitee.length).eq(4);
	expect(usersWithInvitee[3]?.invitee).toBeNull();
	expect(usersWithInvitee[2]?.invitee).toBeNull();
	expect(usersWithInvitee[1]?.invitee).not.toBeNull();
	expect(usersWithInvitee[0]?.invitee).not.toBeNull();

	expect(usersWithInvitee[3]).toEqual({
		id: 1,
		name: 'Dan',
		verified: false,
		invitedBy: null,
		invitee: null,
	});
	expect(usersWithInvitee[2]).toEqual({
		id: 2,
		name: 'Andrew',
		verified: false,
		invitedBy: null,
		invitee: null,
	});
	expect(usersWithInvitee[1]).toEqual({
		id: 3,
		name: 'Alex',
		verified: false,
		invitedBy: 1,
		invitee: { id: 1, name: 'Dan', verified: false, invitedBy: null },
	});
	expect(usersWithInvitee[0]).toEqual({
		id: 4,
		name: 'John',
		verified: false,
		invitedBy: 2,
		invitee: { id: 2, name: 'Andrew', verified: false, invitedBy: null },
	});
});

test('Get user with invitee + where', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex', invitedBy: 1 },
		{ id: 4, name: 'John', invitedBy: 2 },
	]);

	const usersWithInvitee = await db.query.usersTable.findMany({
		where: (users, { eq, or }) => (or(eq(users.id, 3), eq(users.id, 4))),
		with: {
			invitee: true,
		},
	});

	expectTypeOf(usersWithInvitee).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: boolean;
			invitedBy: number | null;
			invitee: {
				id: number;
				name: string;
				verified: boolean;
				invitedBy: number | null;
			} | null;
		}[]
	>();

	expect(usersWithInvitee.length).eq(2);
	expect(usersWithInvitee[0]?.invitee).not.toBeNull();
	expect(usersWithInvitee[1]?.invitee).not.toBeNull();

	expect(usersWithInvitee).toContainEqual({
		id: 3,
		name: 'Alex',
		verified: false,
		invitedBy: 1,
		invitee: { id: 1, name: 'Dan', verified: false, invitedBy: null },
	});
	expect(usersWithInvitee).toContainEqual({
		id: 4,
		name: 'John',
		verified: false,
		invitedBy: 2,
		invitee: { id: 2, name: 'Andrew', verified: false, invitedBy: null },
	});
});

test('Get user with invitee + where + partial', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex', invitedBy: 1 },
		{ id: 4, name: 'John', invitedBy: 2 },
	]);

	const usersWithInvitee = await db.query.usersTable.findMany({
		where: (users, { eq, or }) => (or(eq(users.id, 3), eq(users.id, 4))),
		columns: {
			id: true,
			name: true,
		},
		with: {
			invitee: {
				columns: {
					id: true,
					name: true,
				},
			},
		},
	});

	expectTypeOf(usersWithInvitee).toEqualTypeOf<
		{
			id: number;
			name: string;
			invitee: {
				id: number;
				name: string;
			} | null;
		}[]
	>();

	expect(usersWithInvitee.length).eq(2);
	expect(usersWithInvitee[0]?.invitee).not.toBeNull();
	expect(usersWithInvitee[1]?.invitee).not.toBeNull();

	expect(usersWithInvitee).toContainEqual({
		id: 3,
		name: 'Alex',
		invitee: { id: 1, name: 'Dan' },
	});
	expect(usersWithInvitee).toContainEqual({
		id: 4,
		name: 'John',
		invitee: { id: 2, name: 'Andrew' },
	});
});

test('Get user with invitee + where + partial.  Did not select users id, but used it in where', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex', invitedBy: 1 },
		{ id: 4, name: 'John', invitedBy: 2 },
	]);

	const usersWithInvitee = await db.query.usersTable.findMany({
		where: (users, { eq, or }) => (or(eq(users.id, 3), eq(users.id, 4))),
		columns: {
			name: true,
		},
		with: {
			invitee: {
				columns: {
					id: true,
					name: true,
				},
			},
		},
	});

	expectTypeOf(usersWithInvitee).toEqualTypeOf<
		{
			name: string;
			invitee: {
				id: number;
				name: string;
			} | null;
		}[]
	>();

	expect(usersWithInvitee.length).eq(2);
	expect(usersWithInvitee[0]?.invitee).not.toBeNull();
	expect(usersWithInvitee[1]?.invitee).not.toBeNull();

	expect(usersWithInvitee).toContainEqual({
		name: 'Alex',
		invitee: { id: 1, name: 'Dan' },
	});
	expect(usersWithInvitee).toContainEqual({
		name: 'John',
		invitee: { id: 2, name: 'Andrew' },
	});
});

test('Get user with invitee + where + partial(true+false)', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex', invitedBy: 1 },
		{ id: 4, name: 'John', invitedBy: 2 },
	]);

	const usersWithInvitee = await db.query.usersTable.findMany({
		where: (users, { eq, or }) => (or(eq(users.id, 3), eq(users.id, 4))),
		columns: {
			id: true,
			name: true,
			verified: false,
		},
		with: {
			invitee: {
				columns: {
					id: true,
					name: true,
					verified: false,
				},
			},
		},
	});

	expectTypeOf(usersWithInvitee).toEqualTypeOf<
		{
			id: number;
			name: string;
			invitee: {
				id: number;
				name: string;
			} | null;
		}[]
	>();

	expect(usersWithInvitee.length).eq(2);
	expect(usersWithInvitee[0]?.invitee).not.toBeNull();
	expect(usersWithInvitee[1]?.invitee).not.toBeNull();

	expect(usersWithInvitee).toContainEqual({
		id: 3,
		name: 'Alex',
		invitee: { id: 1, name: 'Dan' },
	});
	expect(usersWithInvitee).toContainEqual({
		id: 4,
		name: 'John',
		invitee: { id: 2, name: 'Andrew' },
	});
});

test('Get user with invitee + where + partial(false)', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex', invitedBy: 1 },
		{ id: 4, name: 'John', invitedBy: 2 },
	]);

	const usersWithInvitee = await db.query.usersTable.findMany({
		where: (users, { eq, or }) => (or(eq(users.id, 3), eq(users.id, 4))),
		columns: {
			verified: false,
		},
		with: {
			invitee: {
				columns: {
					name: false,
				},
			},
		},
	});

	expectTypeOf(usersWithInvitee).toEqualTypeOf<
		{
			id: number;
			name: string;
			invitedBy: number | null;
			invitee: {
				id: number;
				verified: boolean;
				invitedBy: number | null;
			} | null;
		}[]
	>();

	expect(usersWithInvitee.length).eq(2);
	expect(usersWithInvitee[0]?.invitee).not.toBeNull();
	expect(usersWithInvitee[1]?.invitee).not.toBeNull();

	expect(usersWithInvitee).toContainEqual({
		id: 3,
		name: 'Alex',
		invitedBy: 1,
		invitee: { id: 1, verified: false, invitedBy: null },
	});
	expect(usersWithInvitee).toContainEqual({
		id: 4,
		name: 'John',
		invitedBy: 2,
		invitee: { id: 2, verified: false, invitedBy: null },
	});
});

/*
	Two first-level relations users+users and users+posts
*/

test('Get user with invitee and posts', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex', invitedBy: 1 },
		{ id: 4, name: 'John', invitedBy: 2 },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 3, content: 'Post3' },
	]);

	const response = await db.query.usersTable.findMany({
		with: {
			invitee: true,
			posts: true,
		},
	});

	expectTypeOf(response).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: boolean;
			invitedBy: number | null;
			posts: { id: number; ownerId: number | null; content: string; createdAt: Date }[];
			invitee: {
				id: number;
				name: string;
				verified: boolean;
				invitedBy: number | null;
			} | null;
		}[]
	>();

	response.sort((a, b) => (a.id > b.id) ? 1 : -1);

	expect(response.length).eq(4);

	expect(response[0]?.invitee).toBeNull();
	expect(response[1]?.invitee).toBeNull();
	expect(response[2]?.invitee).not.toBeNull();
	expect(response[3]?.invitee).not.toBeNull();

	expect(response[0]?.posts.length).eq(1);
	expect(response[1]?.posts.length).eq(1);
	expect(response[2]?.posts.length).eq(1);

	expect(response).toContainEqual({
		id: 1,
		name: 'Dan',
		verified: false,
		invitedBy: null,
		invitee: null,
		posts: [{ id: 1, ownerId: 1, content: 'Post1', createdAt: response[0]?.posts[0]?.createdAt }],
	});
	expect(response).toContainEqual({
		id: 2,
		name: 'Andrew',
		verified: false,
		invitedBy: null,
		invitee: null,
		posts: [{ id: 2, ownerId: 2, content: 'Post2', createdAt: response[1]?.posts[0]?.createdAt }],
	});
	expect(response).toContainEqual({
		id: 3,
		name: 'Alex',
		verified: false,
		invitedBy: 1,
		invitee: { id: 1, name: 'Dan', verified: false, invitedBy: null },
		posts: [{ id: 3, ownerId: 3, content: 'Post3', createdAt: response[2]?.posts[0]?.createdAt }],
	});
	expect(response).toContainEqual({
		id: 4,
		name: 'John',
		verified: false,
		invitedBy: 2,
		invitee: { id: 2, name: 'Andrew', verified: false, invitedBy: null },
		posts: [],
	});
});

test('Get user with invitee and posts + limit posts and users', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex', invitedBy: 1 },
		{ id: 4, name: 'John', invitedBy: 2 },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.1' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 2, content: 'Post2.1' },
		{ ownerId: 3, content: 'Post3' },
		{ ownerId: 3, content: 'Post3.1' },
	]);

	const response = await db.query.usersTable.findMany({
		limit: 3,
		with: {
			invitee: true,
			posts: {
				limit: 1,
			},
		},
	});

	expectTypeOf(response).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: boolean;
			invitedBy: number | null;
			posts: { id: number; ownerId: number | null; content: string; createdAt: Date }[];
			invitee: {
				id: number;
				name: string;
				verified: boolean;
				invitedBy: number | null;
			} | null;
		}[]
	>();

	response.sort((a, b) => (a.id > b.id) ? 1 : -1);

	expect(response.length).eq(3);

	expect(response[0]?.invitee).toBeNull();
	expect(response[1]?.invitee).toBeNull();
	expect(response[2]?.invitee).not.toBeNull();

	expect(response[0]?.posts.length).eq(1);
	expect(response[1]?.posts.length).eq(1);
	expect(response[2]?.posts.length).eq(1);

	expect(response).toContainEqual({
		id: 1,
		name: 'Dan',
		verified: false,
		invitedBy: null,
		invitee: null,
		posts: [{ id: 1, ownerId: 1, content: 'Post1', createdAt: response[0]?.posts[0]?.createdAt }],
	});
	expect(response).toContainEqual({
		id: 2,
		name: 'Andrew',
		verified: false,
		invitedBy: null,
		invitee: null,
		posts: [{ id: 3, ownerId: 2, content: 'Post2', createdAt: response[1]?.posts[0]?.createdAt }],
	});
	expect(response).toContainEqual({
		id: 3,
		name: 'Alex',
		verified: false,
		invitedBy: 1,
		invitee: { id: 1, name: 'Dan', verified: false, invitedBy: null },
		posts: [{ id: 5, ownerId: 3, content: 'Post3', createdAt: response[2]?.posts[0]?.createdAt }],
	});
});

test('Get user with invitee and posts + limits + custom fields in each', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex', invitedBy: 1 },
		{ id: 4, name: 'John', invitedBy: 2 },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.1' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 2, content: 'Post2.1' },
		{ ownerId: 3, content: 'Post3' },
		{ ownerId: 3, content: 'Post3.1' },
	]);

	const response = await db.query.usersTable.findMany({
		limit: 3,
		extras: (users, { sql }) => ({ lower: sql<string>`lower(${users.name})`.as('lower_name') }),
		with: {
			invitee: {
				extras: (users, { sql }) => ({ lower: sql<string>`lower(${users.name})`.as('lower_invitee_name') }),
			},
			posts: {
				limit: 1,
				extras: (posts, { sql }) => ({ lower: sql<string>`lower(${posts.content})`.as('lower_content') }),
			},
		},
	});

	expectTypeOf(response).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: boolean;
			lower: string;
			invitedBy: number | null;
			posts: { id: number; lower: string; ownerId: number | null; content: string; createdAt: Date }[];
			invitee: {
				id: number;
				name: string;
				lower: string;
				verified: boolean;
				invitedBy: number | null;
			} | null;
		}[]
	>();

	response.sort((a, b) => (a.id > b.id) ? 1 : -1);

	expect(response.length).eq(3);

	expect(response[0]?.invitee).toBeNull();
	expect(response[1]?.invitee).toBeNull();
	expect(response[2]?.invitee).not.toBeNull();

	expect(response[0]?.posts.length).eq(1);
	expect(response[1]?.posts.length).eq(1);
	expect(response[2]?.posts.length).eq(1);

	expect(response).toContainEqual({
		id: 1,
		name: 'Dan',
		lower: 'dan',
		verified: false,
		invitedBy: null,
		invitee: null,
		posts: [{ id: 1, ownerId: 1, content: 'Post1', lower: 'post1', createdAt: response[0]?.posts[0]?.createdAt }],
	});
	expect(response).toContainEqual({
		id: 2,
		name: 'Andrew',
		lower: 'andrew',
		verified: false,
		invitedBy: null,
		invitee: null,
		posts: [{ id: 3, ownerId: 2, content: 'Post2', lower: 'post2', createdAt: response[1]?.posts[0]?.createdAt }],
	});
	expect(response).toContainEqual({
		id: 3,
		name: 'Alex',
		lower: 'alex',
		verified: false,
		invitedBy: 1,
		invitee: { id: 1, name: 'Dan', lower: 'dan', verified: false, invitedBy: null },
		posts: [{ id: 5, ownerId: 3, content: 'Post3', lower: 'post3', createdAt: response[2]?.posts[0]?.createdAt }],
	});
});

test('Get user with invitee and posts + custom fields in each', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex', invitedBy: 1 },
		{ id: 4, name: 'John', invitedBy: 2 },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.1' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 2, content: 'Post2.1' },
		{ ownerId: 3, content: 'Post3' },
		{ ownerId: 3, content: 'Post3.1' },
	]);

	const response = await db.query.usersTable.findMany({
		extras: (users, { sql }) => ({ lower: sql<string>`lower(${users.name})`.as('lower_name') }),
		with: {
			invitee: {
				extras: (users, { sql }) => ({ lower: sql<string>`lower(${users.name})`.as('lower_name') }),
			},
			posts: {
				extras: (posts, { sql }) => ({ lower: sql<string>`lower(${posts.content})`.as('lower_name') }),
			},
		},
	});

	expectTypeOf(response).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: boolean;
			lower: string;
			invitedBy: number | null;
			posts: { id: number; lower: string; ownerId: number | null; content: string; createdAt: Date }[];
			invitee: {
				id: number;
				name: string;
				lower: string;
				verified: boolean;
				invitedBy: number | null;
			} | null;
		}[]
	>();

	response.sort((a, b) => (a.id > b.id) ? 1 : -1);

	response[0]?.posts.sort((a, b) => (a.id > b.id) ? 1 : -1);
	response[1]?.posts.sort((a, b) => (a.id > b.id) ? 1 : -1);
	response[2]?.posts.sort((a, b) => (a.id > b.id) ? 1 : -1);

	expect(response.length).eq(4);

	expect(response[0]?.invitee).toBeNull();
	expect(response[1]?.invitee).toBeNull();
	expect(response[2]?.invitee).not.toBeNull();
	expect(response[3]?.invitee).not.toBeNull();

	expect(response[0]?.posts.length).eq(2);
	expect(response[1]?.posts.length).eq(2);
	expect(response[2]?.posts.length).eq(2);
	expect(response[3]?.posts.length).eq(0);

	expect(response).toContainEqual({
		id: 1,
		name: 'Dan',
		lower: 'dan',
		verified: false,
		invitedBy: null,
		invitee: null,
		posts: [{ id: 1, ownerId: 1, content: 'Post1', lower: 'post1', createdAt: response[0]?.posts[0]?.createdAt }, {
			id: 2,
			ownerId: 1,
			content: 'Post1.1',
			lower: 'post1.1',
			createdAt: response[0]?.posts[1]?.createdAt,
		}],
	});
	expect(response).toContainEqual({
		id: 2,
		name: 'Andrew',
		lower: 'andrew',
		verified: false,
		invitedBy: null,
		invitee: null,
		posts: [{ id: 3, ownerId: 2, content: 'Post2', lower: 'post2', createdAt: response[1]?.posts[0]?.createdAt }, {
			id: 4,
			ownerId: 2,
			content: 'Post2.1',
			lower: 'post2.1',
			createdAt: response[1]?.posts[1]?.createdAt,
		}],
	});
	expect(response).toContainEqual({
		id: 3,
		name: 'Alex',
		lower: 'alex',
		verified: false,
		invitedBy: 1,
		invitee: { id: 1, name: 'Dan', lower: 'dan', verified: false, invitedBy: null },
		posts: [{ id: 5, ownerId: 3, content: 'Post3', lower: 'post3', createdAt: response[2]?.posts[0]?.createdAt }, {
			id: 6,
			ownerId: 3,
			content: 'Post3.1',
			lower: 'post3.1',
			createdAt: response[2]?.posts[1]?.createdAt,
		}],
	});
	expect(response).toContainEqual({
		id: 4,
		name: 'John',
		lower: 'john',
		verified: false,
		invitedBy: 2,
		invitee: { id: 2, name: 'Andrew', lower: 'andrew', verified: false, invitedBy: null },
		posts: [],
	});
});

test('Get user with invitee and posts + orderBy', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex', invitedBy: 1 },
		{ id: 4, name: 'John', invitedBy: 2 },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.1' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 2, content: 'Post2.1' },
		{ ownerId: 3, content: 'Post3' },
	]);

	const response = await db.query.usersTable.findMany({
		orderBy: (users, { desc }) => [desc(users.id)],
		with: {
			invitee: true,
			posts: {
				orderBy: (posts, { desc }) => [desc(posts.id)],
			},
		},
	});

	expectTypeOf(response).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: boolean;
			invitedBy: number | null;
			posts: { id: number; ownerId: number | null; content: string; createdAt: Date }[];
			invitee: {
				id: number;
				name: string;
				verified: boolean;
				invitedBy: number | null;
			} | null;
		}[]
	>();

	expect(response.length).eq(4);

	expect(response[3]?.invitee).toBeNull();
	expect(response[2]?.invitee).toBeNull();
	expect(response[1]?.invitee).not.toBeNull();
	expect(response[0]?.invitee).not.toBeNull();

	expect(response[0]?.posts.length).eq(0);
	expect(response[1]?.posts.length).eq(1);
	expect(response[2]?.posts.length).eq(2);
	expect(response[3]?.posts.length).eq(2);

	expect(response[3]).toEqual({
		id: 1,
		name: 'Dan',
		verified: false,
		invitedBy: null,
		invitee: null,
		posts: [{ id: 2, ownerId: 1, content: 'Post1.1', createdAt: response[3]?.posts[0]?.createdAt }, {
			id: 1,
			ownerId: 1,
			content: 'Post1',
			createdAt: response[3]?.posts[1]?.createdAt,
		}],
	});
	expect(response[2]).toEqual({
		id: 2,
		name: 'Andrew',
		verified: false,
		invitedBy: null,
		invitee: null,
		posts: [{ id: 4, ownerId: 2, content: 'Post2.1', createdAt: response[2]?.posts[0]?.createdAt }, {
			id: 3,
			ownerId: 2,
			content: 'Post2',
			createdAt: response[2]?.posts[1]?.createdAt,
		}],
	});
	expect(response[1]).toEqual({
		id: 3,
		name: 'Alex',
		verified: false,
		invitedBy: 1,
		invitee: { id: 1, name: 'Dan', verified: false, invitedBy: null },
		posts: [{
			id: 5,
			ownerId: 3,
			content: 'Post3',
			createdAt: response[3]?.posts[1]?.createdAt,
		}],
	});
	expect(response[0]).toEqual({
		id: 4,
		name: 'John',
		verified: false,
		invitedBy: 2,
		invitee: { id: 2, name: 'Andrew', verified: false, invitedBy: null },
		posts: [],
	});
});

test('Get user with invitee and posts + where', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex', invitedBy: 1 },
		{ id: 4, name: 'John', invitedBy: 2 },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 3, content: 'Post3' },
	]);

	const response = await db.query.usersTable.findMany({
		where: (users, { eq, or }) => (or(eq(users.id, 2), eq(users.id, 3))),
		with: {
			invitee: true,
			posts: {
				where: (posts, { eq }) => (eq(posts.ownerId, 2)),
			},
		},
	});

	expectTypeOf(response).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: boolean;
			invitedBy: number | null;
			posts: { id: number; ownerId: number | null; content: string; createdAt: Date }[];
			invitee: {
				id: number;
				name: string;
				verified: boolean;
				invitedBy: number | null;
			} | null;
		}[]
	>();

	response.sort((a, b) => (a.id > b.id) ? 1 : -1);

	expect(response.length).eq(2);

	expect(response[0]?.invitee).toBeNull();
	expect(response[1]?.invitee).not.toBeNull();

	expect(response[0]?.posts.length).eq(1);
	expect(response[1]?.posts.length).eq(0);

	expect(response).toContainEqual({
		id: 2,
		name: 'Andrew',
		verified: false,
		invitedBy: null,
		invitee: null,
		posts: [{ id: 2, ownerId: 2, content: 'Post2', createdAt: response[0]?.posts[0]?.createdAt }],
	});
	expect(response).toContainEqual({
		id: 3,
		name: 'Alex',
		verified: false,
		invitedBy: 1,
		invitee: { id: 1, name: 'Dan', verified: false, invitedBy: null },
		posts: [],
	});
});

test('Get user with invitee and posts + limit posts and users + where', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex', invitedBy: 1 },
		{ id: 4, name: 'John', invitedBy: 2 },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.1' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 2, content: 'Post2.1' },
		{ ownerId: 3, content: 'Post3' },
		{ ownerId: 3, content: 'Post3.1' },
	]);

	const response = await db.query.usersTable.findMany({
		where: (users, { eq, or }) => (or(eq(users.id, 3), eq(users.id, 4))),
		limit: 1,
		with: {
			invitee: true,
			posts: {
				where: (posts, { eq }) => (eq(posts.ownerId, 3)),
				limit: 1,
			},
		},
	});

	expectTypeOf(response).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: boolean;
			invitedBy: number | null;
			posts: { id: number; ownerId: number | null; content: string; createdAt: Date }[];
			invitee: {
				id: number;
				name: string;
				verified: boolean;
				invitedBy: number | null;
			} | null;
		}[]
	>();

	expect(response.length).eq(1);

	expect(response[0]?.invitee).not.toBeNull();
	expect(response[0]?.posts.length).eq(1);

	expect(response).toContainEqual({
		id: 3,
		name: 'Alex',
		verified: false,
		invitedBy: 1,
		invitee: { id: 1, name: 'Dan', verified: false, invitedBy: null },
		posts: [{ id: 5, ownerId: 3, content: 'Post3', createdAt: response[0]?.posts[0]?.createdAt }],
	});
});

test('Get user with invitee and posts + orderBy + where + custom', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex', invitedBy: 1 },
		{ id: 4, name: 'John', invitedBy: 2 },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.1' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 2, content: 'Post2.1' },
		{ ownerId: 3, content: 'Post3' },
	]);

	const response = await db.query.usersTable.findMany({
		orderBy: [desc(usersTable.id)],
		where: or(eq(usersTable.id, 3), eq(usersTable.id, 4)),
		extras: {
			lower: sql<string>`lower(${usersTable.name})`.as('lower_name'),
		},
		with: {
			invitee: true,
			posts: {
				where: eq(postsTable.ownerId, 3),
				orderBy: [desc(postsTable.id)],
				extras: {
					lower: sql<string>`lower(${postsTable.content})`.as('lower_name'),
				},
			},
		},
	});

	expectTypeOf(response).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: boolean;
			invitedBy: number | null;
			lower: string;
			posts: { id: number; lower: string; ownerId: number | null; content: string; createdAt: Date }[];
			invitee: {
				id: number;
				name: string;
				verified: boolean;
				invitedBy: number | null;
			} | null;
		}[]
	>();

	expect(response.length).eq(2);

	expect(response[1]?.invitee).not.toBeNull();
	expect(response[0]?.invitee).not.toBeNull();

	expect(response[0]?.posts.length).eq(0);
	expect(response[1]?.posts.length).eq(1);

	expect(response[1]).toEqual({
		id: 3,
		name: 'Alex',
		lower: 'alex',
		verified: false,
		invitedBy: 1,
		invitee: { id: 1, name: 'Dan', verified: false, invitedBy: null },
		posts: [{
			id: 5,
			ownerId: 3,
			content: 'Post3',
			lower: 'post3',
			createdAt: response[1]?.posts[0]?.createdAt,
		}],
	});
	expect(response[0]).toEqual({
		id: 4,
		name: 'John',
		lower: 'john',
		verified: false,
		invitedBy: 2,
		invitee: { id: 2, name: 'Andrew', verified: false, invitedBy: null },
		posts: [],
	});
});

test('Get user with invitee and posts + orderBy + where + partial + custom', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex', invitedBy: 1 },
		{ id: 4, name: 'John', invitedBy: 2 },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.1' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 2, content: 'Post2.1' },
		{ ownerId: 3, content: 'Post3' },
	]);

	const response = await db.query.usersTable.findMany({
		orderBy: [desc(usersTable.id)],
		where: or(eq(usersTable.id, 3), eq(usersTable.id, 4)),
		extras: {
			lower: sql<string>`lower(${usersTable.name})`.as('lower_name'),
		},
		columns: {
			id: true,
			name: true,
		},
		with: {
			invitee: {
				columns: {
					id: true,
					name: true,
				},
				extras: {
					lower: sql<string>`lower(${usersTable.name})`.as('lower_name'),
				},
			},
			posts: {
				columns: {
					id: true,
					content: true,
				},
				where: eq(postsTable.ownerId, 3),
				orderBy: [desc(postsTable.id)],
				extras: {
					lower: sql<string>`lower(${postsTable.content})`.as('lower_name'),
				},
			},
		},
	});

	expectTypeOf(response).toEqualTypeOf<
		{
			id: number;
			name: string;
			lower: string;
			posts: { id: number; lower: string; content: string }[];
			invitee: {
				id: number;
				name: string;
				lower: string;
			} | null;
		}[]
	>();

	expect(response.length).eq(2);

	expect(response[1]?.invitee).not.toBeNull();
	expect(response[0]?.invitee).not.toBeNull();

	expect(response[0]?.posts.length).eq(0);
	expect(response[1]?.posts.length).eq(1);

	expect(response[1]).toEqual({
		id: 3,
		name: 'Alex',
		lower: 'alex',
		invitee: { id: 1, name: 'Dan', lower: 'dan' },
		posts: [{
			id: 5,
			content: 'Post3',
			lower: 'post3',
		}],
	});
	expect(response[0]).toEqual({
		id: 4,
		name: 'John',
		lower: 'john',
		invitee: { id: 2, name: 'Andrew', lower: 'andrew' },
		posts: [],
	});
});

/*
	One two-level relation users+posts+comments
*/

test('Get user with posts and posts with comments', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(postsTable).values([
		{ id: 1, ownerId: 1, content: 'Post1' },
		{ id: 2, ownerId: 2, content: 'Post2' },
		{ id: 3, ownerId: 3, content: 'Post3' },
	]);

	await db.insert(commentsTable).values([
		{ postId: 1, content: 'Comment1', creator: 2 },
		{ postId: 2, content: 'Comment2', creator: 2 },
		{ postId: 3, content: 'Comment3', creator: 3 },
	]);

	const response = await db.query.usersTable.findMany({
		with: {
			posts: {
				with: {
					comments: true,
				},
			},
		},
	});

	expectTypeOf(response).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: boolean;
			invitedBy: number | null;
			posts: {
				id: number;
				content: string;
				ownerId: number | null;
				createdAt: Date;
				comments: {
					id: number;
					content: string;
					createdAt: Date;
					creator: number | null;
					postId: number | null;
				}[];
			}[];
		}[]
	>();

	response.sort((a, b) => (a.id > b.id) ? 1 : -1);

	expect(response.length).eq(3);
	expect(response[0]?.posts.length).eq(1);
	expect(response[1]?.posts.length).eq(1);
	expect(response[2]?.posts.length).eq(1);

	expect(response[0]?.posts[0]?.comments.length).eq(1);
	expect(response[1]?.posts[0]?.comments.length).eq(1);
	expect(response[2]?.posts[0]?.comments.length).eq(1);

	expect(response[0]).toEqual({
		id: 1,
		name: 'Dan',
		verified: false,
		invitedBy: null,
		posts: [{
			id: 1,
			ownerId: 1,
			content: 'Post1',
			createdAt: response[0]?.posts[0]?.createdAt,
			comments: [
				{
					id: 1,
					content: 'Comment1',
					creator: 2,
					postId: 1,
					createdAt: response[0]?.posts[0]?.comments[0]?.createdAt,
				},
			],
		}],
	});
	expect(response[1]).toEqual({
		id: 2,
		name: 'Andrew',
		verified: false,
		invitedBy: null,
		posts: [{
			id: 2,
			ownerId: 2,
			content: 'Post2',
			createdAt: response[1]?.posts[0]?.createdAt,
			comments: [
				{
					id: 2,
					content: 'Comment2',
					creator: 2,
					postId: 2,
					createdAt: response[1]?.posts[0]?.comments[0]?.createdAt,
				},
			],
		}],
	});
	// expect(response[2]).toEqual({
	// 	id: 3,
	// 	name: 'Alex',
	// 	verified: false,
	// 	invitedBy: null,
	// 	posts: [{
	// 		id: 3,
	// 		ownerId: 3,
	// 		content: 'Post3',
	// 		createdAt: response[2]?.posts[0]?.createdAt,
	// 		comments: [
	// 			{
	// 				id: ,
	// 				content: 'Comment3',
	// 				creator: 3,
	// 				postId: 3,
	// 				createdAt: response[2]?.posts[0]?.comments[0]?.createdAt,
	// 			},
	// 		],
	// 	}],
	// });
});

// Get user with limit posts and limit comments

// Get user with custom field + post + comment with custom field

// Get user with limit + posts orderBy + comment orderBy

// Get user with where + posts where + comment where

// Get user with where + posts partial where + comment where

// Get user with where + posts partial where + comment partial(false) where

// Get user with where partial(false) + posts partial where partial(false) + comment partial(false+true) where

// Get user with where + posts partial where + comment where. Didn't select field from where in posts

// Get user with where + posts partial where + comment where. Didn't select field from where for all

// Get with limit+offset in each

/*
	One two-level + One first-level relation users+posts+comments and users+users
*/

/*
	One three-level relation users+posts+comments+comment_owner
*/

test('Get user with posts and posts with comments and comments with owner', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(postsTable).values([
		{ id: 1, ownerId: 1, content: 'Post1' },
		{ id: 2, ownerId: 2, content: 'Post2' },
		{ id: 3, ownerId: 3, content: 'Post3' },
	]);

	await db.insert(commentsTable).values([
		{ postId: 1, content: 'Comment1', creator: 2 },
		{ postId: 2, content: 'Comment2', creator: 2 },
		{ postId: 3, content: 'Comment3', creator: 3 },
	]);

	const response = await db.query.usersTable.findMany({
		with: {
			posts: {
				with: {
					comments: {
						with: {
							author: true,
						},
					},
				},
			},
		},
	});

	expectTypeOf(response).toEqualTypeOf<{
		id: number;
		name: string;
		verified: boolean;
		invitedBy: number | null;
		posts: {
			id: number;
			content: string;
			ownerId: number | null;
			createdAt: Date;
			comments: {
				id: number;
				content: string;
				createdAt: Date;
				creator: number | null;
				postId: number | null;
				author: {
					id: number;
					name: string;
					verified: boolean;
					invitedBy: number | null;
				} | null;
			}[];
		}[];
	}[]>();

	response.sort((a, b) => (a.id > b.id) ? 1 : -1);

	expect(response.length).eq(3);
	expect(response[0]?.posts.length).eq(1);
	expect(response[1]?.posts.length).eq(1);
	expect(response[2]?.posts.length).eq(1);

	expect(response[0]?.posts[0]?.comments.length).eq(1);
	expect(response[1]?.posts[0]?.comments.length).eq(1);
	expect(response[2]?.posts[0]?.comments.length).eq(1);

	expect(response[0]).toEqual({
		id: 1,
		name: 'Dan',
		verified: false,
		invitedBy: null,
		posts: [{
			id: 1,
			ownerId: 1,
			content: 'Post1',
			createdAt: response[0]?.posts[0]?.createdAt,
			comments: [
				{
					id: 1,
					content: 'Comment1',
					creator: 2,
					author: {
						id: 2,
						name: 'Andrew',
						verified: false,
						invitedBy: null,
					},
					postId: 1,
					createdAt: response[0]?.posts[0]?.comments[0]?.createdAt,
				},
			],
		}],
	});
	expect(response[1]).toEqual({
		id: 2,
		name: 'Andrew',
		verified: false,
		invitedBy: null,
		posts: [{
			id: 2,
			ownerId: 2,
			content: 'Post2',
			createdAt: response[1]?.posts[0]?.createdAt,
			comments: [
				{
					id: 2,
					content: 'Comment2',
					creator: 2,
					author: {
						id: 2,
						name: 'Andrew',
						verified: false,
						invitedBy: null,
					},
					postId: 2,
					createdAt: response[1]?.posts[0]?.comments[0]?.createdAt,
				},
			],
		}],
	});
});

/*
	One three-level relation + 1 first-level relatioon
	1. users+posts+comments+comment_owner
	2. users+users
*/

/*
	One four-level relation users+posts+comments+coment_likes
*/

/*
	[Find Many] Many-to-many cases

	Users+users_to_groups+groups
*/

test('[Find Many] Get users with groups', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]);

	await db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 3, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]);

	const response = await db.query.usersTable.findMany({
		with: {
			usersToGroups: {
				columns: {},
				with: {
					group: true,
				},
			},
		},
	});

	expectTypeOf(response).toEqualTypeOf<{
		id: number;
		name: string;
		verified: boolean;
		invitedBy: number | null;
		usersToGroups: {
			group: {
				id: number;
				name: string;
				description: string | null;
			};
		}[];
	}[]>();

	response.sort((a, b) => (a.id > b.id) ? 1 : -1);

	expect(response.length).toEqual(3);

	expect(response[0]?.usersToGroups.length).toEqual(1);
	expect(response[1]?.usersToGroups.length).toEqual(1);
	expect(response[2]?.usersToGroups.length).toEqual(2);

	expect(response).toContainEqual({
		id: 1,
		name: 'Dan',
		verified: false,
		invitedBy: null,
		usersToGroups: [{
			group: {
				id: 1,
				name: 'Group1',
				description: null,
			},
		}],
	});

	expect(response).toContainEqual({
		id: 2,
		name: 'Andrew',
		verified: false,
		invitedBy: null,
		usersToGroups: [{
			group: {
				id: 2,
				name: 'Group2',
				description: null,
			},
		}],
	});

	expect(response).toContainEqual({
		id: 3,
		name: 'Alex',
		verified: false,
		invitedBy: null,
		usersToGroups: [{
			group: {
				id: 3,
				name: 'Group3',
				description: null,
			},
		}, {
			group: {
				id: 2,
				name: 'Group2',
				description: null,
			},
		}],
	});
});

test('[Find Many] Get groups with users', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]);

	await db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 3, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]);

	const response = await db.query.groupsTable.findMany({
		with: {
			usersToGroups: {
				columns: {},
				with: {
					user: true,
				},
			},
		},
	});

	expectTypeOf(response).toEqualTypeOf<{
		id: number;
		name: string;
		description: string | null;
		usersToGroups: {
			user: {
				id: number;
				name: string;
				verified: boolean;
				invitedBy: number | null;
			};
		}[];
	}[]>();

	response.sort((a, b) => (a.id > b.id) ? 1 : -1);

	expect(response.length).toEqual(3);

	expect(response[0]?.usersToGroups.length).toEqual(1);
	expect(response[1]?.usersToGroups.length).toEqual(2);
	expect(response[2]?.usersToGroups.length).toEqual(1);

	expect(response).toContainEqual({
		id: 1,
		name: 'Group1',
		description: null,
		usersToGroups: [{
			user: {
				id: 1,
				name: 'Dan',
				verified: false,
				invitedBy: null,
			},
		}],
	});

	expect(response).toContainEqual({
		id: 2,
		name: 'Group2',
		description: null,
		usersToGroups: [{
			user: {
				id: 2,
				name: 'Andrew',
				verified: false,
				invitedBy: null,
			},
		}, {
			user: {
				id: 3,
				name: 'Alex',
				verified: false,
				invitedBy: null,
			},
		}],
	});

	expect(response).toContainEqual({
		id: 3,
		name: 'Group3',
		description: null,
		usersToGroups: [{
			user: {
				id: 3,
				name: 'Alex',
				verified: false,
				invitedBy: null,
			},
		}],
	});
});

test('[Find Many] Get users with groups + limit', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]);

	await db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 2, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]);

	const response = await db.query.usersTable.findMany({
		limit: 2,
		with: {
			usersToGroups: {
				limit: 1,
				columns: {},
				with: {
					group: true,
				},
			},
		},
	});

	expectTypeOf(response).toEqualTypeOf<{
		id: number;
		name: string;
		verified: boolean;
		invitedBy: number | null;
		usersToGroups: {
			group: {
				id: number;
				name: string;
				description: string | null;
			};
		}[];
	}[]>();

	response.sort((a, b) => (a.id > b.id) ? 1 : -1);

	expect(response.length).toEqual(2);

	expect(response[0]?.usersToGroups.length).toEqual(1);
	expect(response[1]?.usersToGroups.length).toEqual(1);

	expect(response).toContainEqual({
		id: 1,
		name: 'Dan',
		verified: false,
		invitedBy: null,
		usersToGroups: [{
			group: {
				id: 1,
				name: 'Group1',
				description: null,
			},
		}],
	});

	expect(response).toContainEqual({
		id: 2,
		name: 'Andrew',
		verified: false,
		invitedBy: null,
		usersToGroups: [{
			group: {
				id: 2,
				name: 'Group2',
				description: null,
			},
		}],
	});
});

test('[Find Many] Get groups with users + limit', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]);

	await db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 3, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]);

	const response = await db.query.groupsTable.findMany({
		limit: 2,
		with: {
			usersToGroups: {
				limit: 1,
				columns: {},
				with: {
					user: true,
				},
			},
		},
	});

	expectTypeOf(response).toEqualTypeOf<{
		id: number;
		name: string;
		description: string | null;
		usersToGroups: {
			user: {
				id: number;
				name: string;
				verified: boolean;
				invitedBy: number | null;
			};
		}[];
	}[]>();

	response.sort((a, b) => (a.id > b.id) ? 1 : -1);

	expect(response.length).toEqual(2);

	expect(response[0]?.usersToGroups.length).toEqual(1);
	expect(response[1]?.usersToGroups.length).toEqual(1);

	expect(response).toContainEqual({
		id: 1,
		name: 'Group1',
		description: null,
		usersToGroups: [{
			user: {
				id: 1,
				name: 'Dan',
				verified: false,
				invitedBy: null,
			},
		}],
	});

	expect(response).toContainEqual({
		id: 2,
		name: 'Group2',
		description: null,
		usersToGroups: [{
			user: {
				id: 2,
				name: 'Andrew',
				verified: false,
				invitedBy: null,
			},
		}],
	});
});

test('[Find Many] Get users with groups + limit + where', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]);

	await db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 2, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]);

	const response = await db.query.usersTable.findMany({
		limit: 1,
		where: (_, { eq, or }) => or(eq(usersTable.id, 1), eq(usersTable.id, 2)),
		with: {
			usersToGroups: {
				where: eq(usersToGroupsTable.groupId, 1),
				columns: {},
				with: {
					group: true,
				},
			},
		},
	});

	expectTypeOf(response).toEqualTypeOf<{
		id: number;
		name: string;
		verified: boolean;
		invitedBy: number | null;
		usersToGroups: {
			group: {
				id: number;
				name: string;
				description: string | null;
			};
		}[];
	}[]>();

	response.sort((a, b) => (a.id > b.id) ? 1 : -1);

	expect(response.length).toEqual(1);

	expect(response[0]?.usersToGroups.length).toEqual(1);

	expect(response).toContainEqual({
		id: 1,
		name: 'Dan',
		verified: false,
		invitedBy: null,
		usersToGroups: [{
			group: {
				id: 1,
				name: 'Group1',
				description: null,
			},
		}],
	});
});

test('[Find Many] Get groups with users + limit + where', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]);

	await db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 3, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]);

	const response = await db.query.groupsTable.findMany({
		limit: 1,
		where: gt(groupsTable.id, 1),
		with: {
			usersToGroups: {
				where: eq(usersToGroupsTable.userId, 2),
				limit: 1,
				columns: {},
				with: {
					user: true,
				},
			},
		},
	});

	expectTypeOf(response).toEqualTypeOf<{
		id: number;
		name: string;
		description: string | null;
		usersToGroups: {
			user: {
				id: number;
				name: string;
				verified: boolean;
				invitedBy: number | null;
			};
		}[];
	}[]>();

	response.sort((a, b) => (a.id > b.id) ? 1 : -1);

	expect(response.length).toEqual(1);

	expect(response[0]?.usersToGroups.length).toEqual(1);

	expect(response).toContainEqual({
		id: 2,
		name: 'Group2',
		description: null,
		usersToGroups: [{
			user: {
				id: 2,
				name: 'Andrew',
				verified: false,
				invitedBy: null,
			},
		}],
	});
});

test('[Find Many] Get users with groups + where', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]);

	await db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 2, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]);

	const response = await db.query.usersTable.findMany({
		where: (_, { eq, or }) => or(eq(usersTable.id, 1), eq(usersTable.id, 2)),
		with: {
			usersToGroups: {
				where: eq(usersToGroupsTable.groupId, 2),
				columns: {},
				with: {
					group: true,
				},
			},
		},
	});

	expectTypeOf(response).toEqualTypeOf<{
		id: number;
		name: string;
		verified: boolean;
		invitedBy: number | null;
		usersToGroups: {
			group: {
				id: number;
				name: string;
				description: string | null;
			};
		}[];
	}[]>();

	response.sort((a, b) => (a.id > b.id) ? 1 : -1);

	expect(response.length).toEqual(2);

	expect(response[0]?.usersToGroups.length).toEqual(0);
	expect(response[1]?.usersToGroups.length).toEqual(1);

	expect(response).toContainEqual({
		id: 1,
		name: 'Dan',
		verified: false,
		invitedBy: null,
		usersToGroups: [],
	});

	expect(response).toContainEqual({
		id: 2,
		name: 'Andrew',
		verified: false,
		invitedBy: null,
		usersToGroups: [{
			group: {
				id: 2,
				name: 'Group2',
				description: null,
			},
		}],
	});
});

test('[Find Many] Get groups with users + where', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]);

	await db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 3, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]);

	const response = await db.query.groupsTable.findMany({
		where: gt(groupsTable.id, 1),
		with: {
			usersToGroups: {
				where: eq(usersToGroupsTable.userId, 2),
				columns: {},
				with: {
					user: true,
				},
			},
		},
	});

	expectTypeOf(response).toEqualTypeOf<{
		id: number;
		name: string;
		description: string | null;
		usersToGroups: {
			user: {
				id: number;
				name: string;
				verified: boolean;
				invitedBy: number | null;
			};
		}[];
	}[]>();

	response.sort((a, b) => (a.id > b.id) ? 1 : -1);

	expect(response.length).toEqual(2);

	expect(response[0]?.usersToGroups.length).toEqual(1);
	expect(response[1]?.usersToGroups.length).toEqual(0);

	expect(response).toContainEqual({
		id: 2,
		name: 'Group2',
		description: null,
		usersToGroups: [{
			user: {
				id: 2,
				name: 'Andrew',
				verified: false,
				invitedBy: null,
			},
		}],
	});

	expect(response).toContainEqual({
		id: 3,
		name: 'Group3',
		description: null,
		usersToGroups: [],
	});
});

test('[Find Many] Get users with groups + orderBy', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]);

	await db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 3, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]);

	const response = await db.query.usersTable.findMany({
		orderBy: (users, { desc }) => [desc(users.id)],
		with: {
			usersToGroups: {
				orderBy: [desc(usersToGroupsTable.groupId)],
				columns: {},
				with: {
					group: true,
				},
			},
		},
	});

	expectTypeOf(response).toEqualTypeOf<{
		id: number;
		name: string;
		verified: boolean;
		invitedBy: number | null;
		usersToGroups: {
			group: {
				id: number;
				name: string;
				description: string | null;
			};
		}[];
	}[]>();

	expect(response.length).toEqual(3);

	expect(response[0]?.usersToGroups.length).toEqual(2);
	expect(response[1]?.usersToGroups.length).toEqual(1);
	expect(response[2]?.usersToGroups.length).toEqual(1);

	expect(response[2]).toEqual({
		id: 1,
		name: 'Dan',
		verified: false,
		invitedBy: null,
		usersToGroups: [{
			group: {
				id: 1,
				name: 'Group1',
				description: null,
			},
		}],
	});

	expect(response[1]).toEqual({
		id: 2,
		name: 'Andrew',
		verified: false,
		invitedBy: null,
		usersToGroups: [{
			group: {
				id: 2,
				name: 'Group2',
				description: null,
			},
		}],
	});

	expect(response[0]).toEqual({
		id: 3,
		name: 'Alex',
		verified: false,
		invitedBy: null,
		usersToGroups: [{
			group: {
				id: 3,
				name: 'Group3',
				description: null,
			},
		}, {
			group: {
				id: 2,
				name: 'Group2',
				description: null,
			},
		}],
	});
});

test('[Find Many] Get groups with users + orderBy', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]);

	await db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 3, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]);

	const response = await db.query.groupsTable.findMany({
		orderBy: [desc(groupsTable.id)],
		with: {
			usersToGroups: {
				orderBy: (utg, { desc }) => [desc(utg.userId)],
				columns: {},
				with: {
					user: true,
				},
			},
		},
	});

	expectTypeOf(response).toEqualTypeOf<{
		id: number;
		name: string;
		description: string | null;
		usersToGroups: {
			user: {
				id: number;
				name: string;
				verified: boolean;
				invitedBy: number | null;
			};
		}[];
	}[]>();

	expect(response.length).toEqual(3);

	expect(response[0]?.usersToGroups.length).toEqual(1);
	expect(response[1]?.usersToGroups.length).toEqual(2);
	expect(response[2]?.usersToGroups.length).toEqual(1);

	expect(response[2]).toEqual({
		id: 1,
		name: 'Group1',
		description: null,
		usersToGroups: [{
			user: {
				id: 1,
				name: 'Dan',
				verified: false,
				invitedBy: null,
			},
		}],
	});

	expect(response[1]).toEqual({
		id: 2,
		name: 'Group2',
		description: null,
		usersToGroups: [{
			user: {
				id: 3,
				name: 'Alex',
				verified: false,
				invitedBy: null,
			},
		}, {
			user: {
				id: 2,
				name: 'Andrew',
				verified: false,
				invitedBy: null,
			},
		}],
	});

	expect(response[0]).toEqual({
		id: 3,
		name: 'Group3',
		description: null,
		usersToGroups: [{
			user: {
				id: 3,
				name: 'Alex',
				verified: false,
				invitedBy: null,
			},
		}],
	});
});

test('[Find Many] Get users with groups + orderBy + limit', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]);

	await db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 3, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]);

	const response = await db.query.usersTable.findMany({
		orderBy: (users, { desc }) => [desc(users.id)],
		limit: 2,
		with: {
			usersToGroups: {
				limit: 1,
				orderBy: [desc(usersToGroupsTable.groupId)],
				columns: {},
				with: {
					group: true,
				},
			},
		},
	});

	expectTypeOf(response).toEqualTypeOf<{
		id: number;
		name: string;
		verified: boolean;
		invitedBy: number | null;
		usersToGroups: {
			group: {
				id: number;
				name: string;
				description: string | null;
			};
		}[];
	}[]>();

	expect(response.length).toEqual(2);

	expect(response[0]?.usersToGroups.length).toEqual(1);
	expect(response[1]?.usersToGroups.length).toEqual(1);

	expect(response[1]).toEqual({
		id: 2,
		name: 'Andrew',
		verified: false,
		invitedBy: null,
		usersToGroups: [{
			group: {
				id: 2,
				name: 'Group2',
				description: null,
			},
		}],
	});

	expect(response[0]).toEqual({
		id: 3,
		name: 'Alex',
		verified: false,
		invitedBy: null,
		usersToGroups: [{
			group: {
				id: 3,
				name: 'Group3',
				description: null,
			},
		}],
	});
});

test('[Find Many] Get users with posts + polymorphic associated notes', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.1' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 3, content: 'Post3' },
	]);

	await db.insert(notes).values([
		{ content: 'Note1', notableId: 1, notableType: 'user' },
		{ content: 'Note1.1', notableId: 1, notableType: 'user' },
		{ content: 'Note2', notableId: 1, notableType: 'post' },
		{ content: 'Note3', notableId: 2, notableType: 'user' },
		{ content: 'Note4', notableId: 3, notableType: 'post' },
		{ content: 'Note5', notableId: 3, notableType: 'user' },
		{ content: 'Note6', notableId: 2, notableType: 'post' },
	]);

	const usersWithPosts = await db.query.usersTable.findMany({
		where: (({ id }, { eq }) => eq(id, 1)),
		with: {
			posts: {
				with: { notes: true },
			},
			notes: true,
		},
	});

	expectTypeOf(usersWithPosts).toEqualTypeOf<{
		id: number;
		name: string;
		verified: boolean;
		invitedBy: number | null;
		posts: {
			id: number;
			content: string;
			ownerId: number | null;
			createdAt: Date;
			notes: {
				id: number;
				content: string;
				notableId: number;
				notableType: 'user' | 'post' | 'comment';
			}[];
		}[];
		notes: {
			id: number;
			content: string;
			notableId: number;
			notableType: 'user' | 'post' | 'comment';
		}[];
	}[]>();

	expect(usersWithPosts.length).eq(1);
	expect(usersWithPosts[0]?.posts.length).eq(2);
	expect(usersWithPosts[0]?.posts[0]?.notes.length).eq(1);
	expect(usersWithPosts[0]?.notes.length).eq(2);

	expect(usersWithPosts[0]).toEqual({
		id: 1,
		name: 'Dan',
		verified: false,
		invitedBy: null,
		posts: [{
			id: 1,
			ownerId: 1,
			content: 'Post1',
			createdAt: usersWithPosts[0]?.posts[0]?.createdAt,
			notes: [
				{ id: 3, content: 'Note2', notableId: 1, notableType: 'post' },
			],
		}, {
			id: 2,
			ownerId: 1,
			content: 'Post1.1',
			createdAt: usersWithPosts[0]?.posts[0]?.createdAt,
			notes: [
				{ id: 7, content: 'Note6', notableId: 2, notableType: 'post' },
			],
		}],
		notes: [
			{ id: 1, content: 'Note1', notableId: 1, notableType: 'user' },
			{ id: 2, content: 'Note1.1', notableId: 1, notableType: 'user' },
		],
	});
});

test('[Find Many] Get users with posts + where + polymorphic associated notes', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.1' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 3, content: 'Post3' },
	]);

	await db.insert(notes).values([
		{ content: 'Note1', notableId: 1, notableType: 'user' },
		{ content: 'Note1.1', notableId: 1, notableType: 'user' },
		{ content: 'Note2', notableId: 1, notableType: 'post' },
		{ content: 'Note3', notableId: 2, notableType: 'user' },
		{ content: 'Note4', notableId: 3, notableType: 'post' },
		{ content: 'Note5', notableId: 3, notableType: 'user' },
		{ content: 'Note6', notableId: 2, notableType: 'post' },
	]);

	const usersWithPosts = await db.query.usersTable.findMany({
		where: (({ id }, { eq }) => eq(id, 1)),
		with: {
			posts: {
				where: (({ id }, { eq }) => eq(id, 1)),
				with: { notes: true },
			},
			notes: true,
		},
	});

	expectTypeOf(usersWithPosts).toEqualTypeOf<{
		id: number;
		name: string;
		verified: boolean;
		invitedBy: number | null;
		posts: {
			id: number;
			content: string;
			ownerId: number | null;
			createdAt: Date;
			notes: {
				id: number;
				content: string;
				notableId: number;
				notableType: 'user' | 'post' | 'comment';
			}[];
		}[];
		notes: {
			id: number;
			content: string;
			notableId: number;
			notableType: 'user' | 'post' | 'comment';
		}[];
	}[]>();

	expect(usersWithPosts.length).eq(1);
	expect(usersWithPosts[0]?.posts.length).eq(1);
	expect(usersWithPosts[0]?.posts[0]?.notes.length).eq(1);
	expect(usersWithPosts[0]?.notes.length).eq(2);

	expect(usersWithPosts[0]).toEqual({
		id: 1,
		name: 'Dan',
		verified: false,
		invitedBy: null,
		posts: [{
			id: 1,
			ownerId: 1,
			content: 'Post1',
			createdAt: usersWithPosts[0]?.posts[0]?.createdAt,
			notes: [
				{ id: 3, content: 'Note2', notableId: 1, notableType: 'post' },
			],
		}],
		notes: [
			{ id: 1, content: 'Note1', notableId: 1, notableType: 'user' },
			{ id: 2, content: 'Note1.1', notableId: 1, notableType: 'user' },
		],
	});
});

test('[Find Many] Get notes with comments', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.1' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 3, content: 'Post3' },
	]);

	await db.insert(commentsTable).values([
		{ content: 'Comments1', creator: 1, postId: 1 },
		{ content: 'Comments1.1', creator: 1, postId: 1 },
		{ content: 'comment', creator: 1, postId: 1 }, // only this should work
	]);

	await db.insert(notes).values([
		{ content: 'Note1', notableId: 1, notableType: 'comment' },
		{ content: 'Note2', notableId: 1, notableType: 'comment' },
		{ content: 'Note3', notableId: 3, notableType: 'comment' },
	]);
	const select = await db.select().from(commentsTable);
	const query = db.query.notes.findMany({
		with: {
			comment: true,
		},
	});
	console.log({ query: query.toSQL(), select });

	const notesWithComments = await query;

	expectTypeOf(notesWithComments).toEqualTypeOf<
		{
			id: number;
			content: string;
			notableId: number;
			notableType: 'user' | 'post' | 'comment';
			comment: {
				id: number;
				content: string;
				createdAt: Date;
				creator: number | null;
				postId: number | null;
			};
		}[]
	>();

	expect(notesWithComments.length).eq(3);
	expect(notesWithComments[2]?.comment).not.toBeNull();

	expect(notesWithComments).toEqual([
		{
			id: 1,
			content: 'Note1',
			notableId: 1,
			notableType: 'comment',
			comment: null,
		},
		{ id: 2, content: 'Note2', notableId: 1, notableType: 'comment', comment: null },
		{
			id: 3,
			content: 'Note3',
			notableId: 3,
			notableType: 'comment',
			comment: {
				id: 3,
				content: 'comment',
				createdAt: notesWithComments[2]?.comment?.createdAt,
				creator: 1,
				postId: 1,
			},
		},
	]);
});

/*
	[Find One] Many-to-many cases

	Users+users_to_groups+groups
*/

test('[Find One] Get users with groups', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]);

	await db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 3, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]);

	const response = await db.query.usersTable.findFirst({
		with: {
			usersToGroups: {
				columns: {},
				with: {
					group: true,
				},
			},
		},
	});

	expectTypeOf(response).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: boolean;
			invitedBy: number | null;
			usersToGroups: {
				group: {
					id: number;
					name: string;
					description: string | null;
				};
			}[];
		} | undefined
	>();

	expect(response?.usersToGroups.length).toEqual(1);

	expect(response).toEqual({
		id: 1,
		name: 'Dan',
		verified: false,
		invitedBy: null,
		usersToGroups: [{
			group: {
				id: 1,
				name: 'Group1',
				description: null,
			},
		}],
	});
});

test('[Find One] Get groups with users', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]);

	await db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 3, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]);

	const response = await db.query.groupsTable.findFirst({
		with: {
			usersToGroups: {
				columns: {},
				with: {
					user: true,
				},
			},
		},
	});

	expectTypeOf(response).toEqualTypeOf<
		{
			id: number;
			name: string;
			description: string | null;
			usersToGroups: {
				user: {
					id: number;
					name: string;
					verified: boolean;
					invitedBy: number | null;
				};
			}[];
		} | undefined
	>();

	expect(response?.usersToGroups.length).toEqual(1);

	expect(response).toEqual({
		id: 1,
		name: 'Group1',
		description: null,
		usersToGroups: [{
			user: {
				id: 1,
				name: 'Dan',
				verified: false,
				invitedBy: null,
			},
		}],
	});
});

test('[Find One] Get users with groups + limit', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]);

	await db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 2, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]);

	const response = await db.query.usersTable.findFirst({
		with: {
			usersToGroups: {
				limit: 1,
				columns: {},
				with: {
					group: true,
				},
			},
		},
	});

	expectTypeOf(response).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: boolean;
			invitedBy: number | null;
			usersToGroups: {
				group: {
					id: number;
					name: string;
					description: string | null;
				};
			}[];
		} | undefined
	>();

	expect(response?.usersToGroups.length).toEqual(1);

	expect(response).toEqual({
		id: 1,
		name: 'Dan',
		verified: false,
		invitedBy: null,
		usersToGroups: [{
			group: {
				id: 1,
				name: 'Group1',
				description: null,
			},
		}],
	});
});

test('[Find One] Get groups with users + limit', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]);

	await db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 3, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]);

	const response = await db.query.groupsTable.findFirst({
		with: {
			usersToGroups: {
				limit: 1,
				columns: {},
				with: {
					user: true,
				},
			},
		},
	});

	expectTypeOf(response).toEqualTypeOf<
		{
			id: number;
			name: string;
			description: string | null;
			usersToGroups: {
				user: {
					id: number;
					name: string;
					verified: boolean;
					invitedBy: number | null;
				};
			}[];
		} | undefined
	>();

	expect(response?.usersToGroups.length).toEqual(1);

	expect(response).toEqual({
		id: 1,
		name: 'Group1',
		description: null,
		usersToGroups: [{
			user: {
				id: 1,
				name: 'Dan',
				verified: false,
				invitedBy: null,
			},
		}],
	});
});

test('[Find One] Get users with groups + limit + where', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]);

	await db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 2, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]);

	const response = await db.query.usersTable.findFirst({
		where: (_, { eq, or }) => or(eq(usersTable.id, 1), eq(usersTable.id, 2)),
		with: {
			usersToGroups: {
				where: eq(usersToGroupsTable.groupId, 1),
				columns: {},
				with: {
					group: true,
				},
			},
		},
	});

	expectTypeOf(response).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: boolean;
			invitedBy: number | null;
			usersToGroups: {
				group: {
					id: number;
					name: string;
					description: string | null;
				};
			}[];
		} | undefined
	>();

	expect(response?.usersToGroups.length).toEqual(1);

	expect(response).toEqual({
		id: 1,
		name: 'Dan',
		verified: false,
		invitedBy: null,
		usersToGroups: [{
			group: {
				id: 1,
				name: 'Group1',
				description: null,
			},
		}],
	});
});

test('[Find One] Get groups with users + limit + where', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]);

	await db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 3, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]);

	const response = await db.query.groupsTable.findFirst({
		where: gt(groupsTable.id, 1),
		with: {
			usersToGroups: {
				where: eq(usersToGroupsTable.userId, 2),
				limit: 1,
				columns: {},
				with: {
					user: true,
				},
			},
		},
	});

	expectTypeOf(response).toEqualTypeOf<
		{
			id: number;
			name: string;
			description: string | null;
			usersToGroups: {
				user: {
					id: number;
					name: string;
					verified: boolean;
					invitedBy: number | null;
				};
			}[];
		} | undefined
	>();

	expect(response?.usersToGroups.length).toEqual(1);

	expect(response).toEqual({
		id: 2,
		name: 'Group2',
		description: null,
		usersToGroups: [{
			user: {
				id: 2,
				name: 'Andrew',
				verified: false,
				invitedBy: null,
			},
		}],
	});
});

test('[Find One] Get users with groups + where', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]);

	await db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 2, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]);

	const response = await db.query.usersTable.findFirst({
		where: (_, { eq, or }) => or(eq(usersTable.id, 1), eq(usersTable.id, 2)),
		with: {
			usersToGroups: {
				where: eq(usersToGroupsTable.groupId, 2),
				columns: {},
				with: {
					group: true,
				},
			},
		},
	});

	expectTypeOf(response).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: boolean;
			invitedBy: number | null;
			usersToGroups: {
				group: {
					id: number;
					name: string;
					description: string | null;
				};
			}[];
		} | undefined
	>();

	expect(response?.usersToGroups.length).toEqual(0);

	expect(response).toEqual({
		id: 1,
		name: 'Dan',
		verified: false,
		invitedBy: null,
		usersToGroups: [],
	});
});

test('[Find One] Get groups with users + where', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]);

	await db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 3, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]);

	const response = await db.query.groupsTable.findFirst({
		where: gt(groupsTable.id, 1),
		with: {
			usersToGroups: {
				where: eq(usersToGroupsTable.userId, 2),
				columns: {},
				with: {
					user: true,
				},
			},
		},
	});

	expectTypeOf(response).toEqualTypeOf<
		{
			id: number;
			name: string;
			description: string | null;
			usersToGroups: {
				user: {
					id: number;
					name: string;
					verified: boolean;
					invitedBy: number | null;
				};
			}[];
		} | undefined
	>();

	expect(response?.usersToGroups.length).toEqual(1);

	expect(response).toEqual({
		id: 2,
		name: 'Group2',
		description: null,
		usersToGroups: [{
			user: {
				id: 2,
				name: 'Andrew',
				verified: false,
				invitedBy: null,
			},
		}],
	});
});

test('[Find One] Get users with groups + orderBy', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]);

	await db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 3, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]);

	const response = await db.query.usersTable.findFirst({
		orderBy: (users, { desc }) => [desc(users.id)],
		with: {
			usersToGroups: {
				orderBy: [desc(usersToGroupsTable.groupId)],
				columns: {},
				with: {
					group: true,
				},
			},
		},
	});

	expectTypeOf(response).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: boolean;
			invitedBy: number | null;
			usersToGroups: {
				group: {
					id: number;
					name: string;
					description: string | null;
				};
			}[];
		} | undefined
	>();

	expect(response?.usersToGroups.length).toEqual(2);

	expect(response).toEqual({
		id: 3,
		name: 'Alex',
		verified: false,
		invitedBy: null,
		usersToGroups: [{
			group: {
				id: 3,
				name: 'Group3',
				description: null,
			},
		}, {
			group: {
				id: 2,
				name: 'Group2',
				description: null,
			},
		}],
	});
});

test('[Find One] Get groups with users + orderBy', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]);

	await db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 3, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]);

	const response = await db.query.groupsTable.findFirst({
		orderBy: [desc(groupsTable.id)],
		with: {
			usersToGroups: {
				orderBy: (utg, { desc }) => [desc(utg.userId)],
				columns: {},
				with: {
					user: true,
				},
			},
		},
	});

	expectTypeOf(response).toEqualTypeOf<
		{
			id: number;
			name: string;
			description: string | null;
			usersToGroups: {
				user: {
					id: number;
					name: string;
					verified: boolean;
					invitedBy: number | null;
				};
			}[];
		} | undefined
	>();

	expect(response?.usersToGroups.length).toEqual(1);

	expect(response).toEqual({
		id: 3,
		name: 'Group3',
		description: null,
		usersToGroups: [{
			user: {
				id: 3,
				name: 'Alex',
				verified: false,
				invitedBy: null,
			},
		}],
	});
});

test('[Find One] Get users with groups + orderBy + limit', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]);

	await db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 3, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]);

	const response = await db.query.usersTable.findFirst({
		orderBy: (users, { desc }) => [desc(users.id)],
		with: {
			usersToGroups: {
				limit: 1,
				orderBy: [desc(usersToGroupsTable.groupId)],
				columns: {},
				with: {
					group: true,
				},
			},
		},
	});

	expectTypeOf(response).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: boolean;
			invitedBy: number | null;
			usersToGroups: {
				group: {
					id: number;
					name: string;
					description: string | null;
				};
			}[];
		} | undefined
	>();

	expect(response?.usersToGroups.length).toEqual(1);

	expect(response).toEqual({
		id: 3,
		name: 'Alex',
		verified: false,
		invitedBy: null,
		usersToGroups: [{
			group: {
				id: 3,
				name: 'Group3',
				description: null,
			},
		}],
	});
});

test('[Find One] Get user with post and comment and notes', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(postsTable).values([
		{ content: 'Post 1', ownerId: 1 },
		{ content: 'Post 2', ownerId: 2 },
	]);

	await db.insert(commentsTable).values([
		{ content: 'Comment 1', creator: 1, postId: 1 },
		{ content: 'Comment 2', creator: 2, postId: 2 },
		{ content: 'Comment 3', creator: 3, postId: 1 },
	]);

	await db.insert(notes).values([
		{ content: 'Note 1', notableId: 1, notableType: 'post' },
		{ content: 'Note 2', notableId: 2, notableType: 'post' },
		{ content: 'Note 3', notableId: 1, notableType: 'user' },
		{ content: 'Note 4', notableId: 3, notableType: 'user' },
		{ content: 'Note 5', notableId: 1, notableType: 'comment' },
		{ content: 'Note 6', notableId: 2, notableType: 'comment' },
		{ content: 'Note 7', notableId: 1, notableType: 'user' },
	]);

	const response = await db.query.usersTable.findFirst({
		with: {
			posts: true,
			comments: true,
			notes: true,
		},
	});

	expectTypeOf(response).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: boolean;
			invitedBy: number | null;
			notes: {
				id: number;
				content: string;
				notableId: number;
				notableType: 'user' | 'post' | 'comment';
			}[];
			posts: {
				id: number;
				content: string;
				ownerId: number | null;
				createdAt: Date;
			}[];
			comments: {
				id: number;
				content: string;
				createdAt: Date;
				creator: number | null;
				postId: number | null;
			}[];
		} | undefined
	>();

	expect(response?.notes.length).toEqual(2);
	expect(response?.posts.length).toEqual(1);
	expect(response?.comments.length).toEqual(1);

	expect(response).toEqual({
		id: 1,
		name: 'Dan',
		verified: false,
		invitedBy: null,
		notes: [
			{ id: 3, content: 'Note 3', notableId: 1, notableType: 'user' },
			{ id: 7, content: 'Note 7', notableId: 1, notableType: 'user' },
		],
		posts: [
			{ id: 1, content: 'Post 1', ownerId: 1, createdAt: response?.posts[0]?.createdAt },
		],
		comments: [
			{ id: 1, content: 'Comment 1', createdAt: response?.comments[0]?.createdAt, creator: 1, postId: 1 },
		],
	});
});

test('Get groups with users + orderBy + limit', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]);

	await db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 3, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]);

	const response = await db.query.groupsTable.findMany({
		orderBy: [desc(groupsTable.id)],
		limit: 2,
		with: {
			usersToGroups: {
				limit: 1,
				orderBy: (utg, { desc }) => [desc(utg.userId)],
				columns: {},
				with: {
					user: true,
				},
			},
		},
	});

	expectTypeOf(response).toEqualTypeOf<
		{
			id: number;
			name: string;
			description: string | null;
			usersToGroups: {
				user: {
					id: number;
					name: string;
					verified: boolean;
					invitedBy: number | null;
				};
			}[];
		}[]
	>();

	expect(response.length).toEqual(2);

	expect(response[0]?.usersToGroups.length).toEqual(1);
	expect(response[1]?.usersToGroups.length).toEqual(1);

	expect(response[1]).toEqual({
		id: 2,
		name: 'Group2',
		description: null,
		usersToGroups: [{
			user: {
				id: 3,
				name: 'Alex',
				verified: false,
				invitedBy: null,
			},
		}],
	});

	expect(response[0]).toEqual({
		id: 3,
		name: 'Group3',
		description: null,
		usersToGroups: [{
			user: {
				id: 3,
				name: 'Alex',
				verified: false,
				invitedBy: null,
			},
		}],
	});
});

test('Get users with groups + custom', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]);

	await db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 3, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]);

	const response = await db.query.usersTable.findMany({
		extras: {
			lower: sql<string>`lower(${usersTable.name})`.as('lower_name'),
		},
		with: {
			usersToGroups: {
				columns: {},
				with: {
					group: {
						extras: {
							lower: sql<string>`lower(${groupsTable.name})`.as('lower_name'),
						},
					},
				},
			},
		},
	});

	expectTypeOf(response).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: boolean;
			invitedBy: number | null;
			lower: string;
			usersToGroups: {
				group: {
					id: number;
					name: string;
					description: string | null;
					lower: string;
				};
			}[];
		}[]
	>();

	response.sort((a, b) => (a.id > b.id) ? 1 : -1);

	expect(response.length).toEqual(3);

	expect(response[0]?.usersToGroups.length).toEqual(1);
	expect(response[1]?.usersToGroups.length).toEqual(1);
	expect(response[2]?.usersToGroups.length).toEqual(2);

	expect(response).toContainEqual({
		id: 1,
		name: 'Dan',
		lower: 'dan',
		verified: false,
		invitedBy: null,
		usersToGroups: [{
			group: {
				id: 1,
				name: 'Group1',
				lower: 'group1',
				description: null,
			},
		}],
	});

	expect(response).toContainEqual({
		id: 2,
		name: 'Andrew',
		lower: 'andrew',
		verified: false,
		invitedBy: null,
		usersToGroups: [{
			group: {
				id: 2,
				name: 'Group2',
				lower: 'group2',
				description: null,
			},
		}],
	});

	expect(response).toContainEqual({
		id: 3,
		name: 'Alex',
		lower: 'alex',
		verified: false,
		invitedBy: null,
		usersToGroups: [{
			group: {
				id: 3,
				name: 'Group3',
				lower: 'group3',
				description: null,
			},
		}, {
			group: {
				id: 2,
				name: 'Group2',
				lower: 'group2',
				description: null,
			},
		}],
	});
});

test('Get groups with users + custom', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]);

	await db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 3, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]);

	const response = await db.query.groupsTable.findMany({
		extras: (table, { sql }) => ({
			lower: sql<string>`lower(${table.name})`.as('lower_name'),
		}),
		with: {
			usersToGroups: {
				columns: {},
				with: {
					user: {
						extras: (table, { sql }) => ({
							lower: sql<string>`lower(${table.name})`.as('lower_name'),
						}),
					},
				},
			},
		},
	});

	expectTypeOf(response).toEqualTypeOf<
		{
			id: number;
			name: string;
			description: string | null;
			lower: string;
			usersToGroups: {
				user: {
					id: number;
					name: string;
					verified: boolean;
					invitedBy: number | null;
					lower: string;
				};
			}[];
		}[]
	>();

	response.sort((a, b) => (a.id > b.id) ? 1 : -1);

	expect(response.length).toEqual(3);

	expect(response[0]?.usersToGroups.length).toEqual(1);
	expect(response[1]?.usersToGroups.length).toEqual(2);
	expect(response[2]?.usersToGroups.length).toEqual(1);

	expect(response).toContainEqual({
		id: 1,
		name: 'Group1',
		lower: 'group1',
		description: null,
		usersToGroups: [{
			user: {
				id: 1,
				name: 'Dan',
				lower: 'dan',
				verified: false,
				invitedBy: null,
			},
		}],
	});

	expect(response).toContainEqual({
		id: 2,
		name: 'Group2',
		lower: 'group2',
		description: null,
		usersToGroups: [{
			user: {
				id: 2,
				name: 'Andrew',
				lower: 'andrew',
				verified: false,
				invitedBy: null,
			},
		}, {
			user: {
				id: 3,
				name: 'Alex',
				lower: 'alex',
				verified: false,
				invitedBy: null,
			},
		}],
	});

	expect(response).toContainEqual({
		id: 3,
		name: 'Group3',
		lower: 'group3',
		description: null,
		usersToGroups: [{
			user: {
				id: 3,
				name: 'Alex',
				lower: 'alex',
				verified: false,
				invitedBy: null,
			},
		}],
	});
});

test('.toSQL()', () => {
	const query = db.query.usersTable.findFirst().toSQL();

	expect(query).toHaveProperty('sql', expect.any(String));
	expect(query).toHaveProperty('params', expect.any(Array));
});

// + custom + where + orderby

// + custom + where + orderby + limit

// + partial

// + partial(false)

// + partial + orderBy + where (all not selected)

/*
	One four-level relation users+posts+comments+coment_likes
	+ users+users_to_groups+groups
*/

/*
	Really hard case
	1. users+posts+comments+coment_likes
	2. users+users_to_groups+groups
	3. users+users
*/
