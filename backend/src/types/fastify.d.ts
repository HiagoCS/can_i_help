import "fastify";

import type {
    FastifyRequest,
    FastifyReply
} from "fastify";

declare module "fastify" {
    interface FastifyInstance {

        authenticate: (
            request: FastifyRequest,
            reply: FastifyReply
        ) => Promise<void>;

        authorize: (
            requiredLevel: number
        ) => (
            request: FastifyRequest,
            reply: FastifyReply
        ) => Promise<void>;

    }

    interface FastifyRequest {

        user: {
            id: number;
            email: string;
        };

    }
}